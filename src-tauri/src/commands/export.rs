use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::db::Database;
use crate::commands::import::copy_new;
use crate::commands::rescan::unique_dest;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub copied: usize,
    pub errors: Vec<String>,
    pub dest_path: String,
}

/// Copies the group's files into a new folder named after the group inside `dest_path`.
/// Never overwrites: an existing folder of that name gets a `-N` sibling, and two photos
/// sharing a filename (different months) get `-N` names, so every photo arrives.
pub fn export_group(
    db: &Database,
    group_id: i64,
    dest_path: &str,
    archive_root: &str,
) -> Result<ExportResult, AppError> {
    let group = db.get_group(group_id)?.ok_or(AppError::GroupNotFound { id: group_id })?;

    let image_ids = db.get_images_in_group(group_id)?;

    let mut copied = 0;
    let mut errors = Vec::new();

    let dest = unique_folder(Path::new(dest_path), &folder_name(&group.name));

    if let Err(e) = std::fs::create_dir_all(&dest) {
        return Err(AppError::FileWrite {
            path: dest.to_string_lossy().to_string(),
            message: format!("Failed to create directory: {}", e),
        });
    }

    for image_id in image_ids {
        if let Some(image) = db.get_image(&image_id)? {
            let src = Path::new(archive_root).join(&image.file_path);
            let dst = unique_dest(&dest, &image.filename);

            if src.exists() {
                match copy_new(&src.to_string_lossy(), &dst) {
                    Ok(_) => copied += 1,
                    Err(e) => {
                        errors.push(format!("Failed to copy {}: {}", image.filename, e));
                    }
                }
            } else {
                errors.push(format!("Source file not found: {}", src.display()));
            }
        }
    }

    Ok(ExportResult {
        copied,
        errors,
        dest_path: dest.to_string_lossy().to_string(),
    })
}

/// `parent/name`, or `parent/name-N` with the first free N. Suffix at the very end:
/// unlike files, a dot in a group name ("Trip 2024.06") is not an extension.
fn unique_folder(parent: &Path, name: &str) -> PathBuf {
    let mut dest = parent.join(name);
    let mut i = 1u32;
    while dest.exists() {
        dest = parent.join(format!("{name}-{i}"));
        i += 1;
    }
    dest
}

/// The group name as one safe folder name on every OS: path separators (which would
/// leave `dest_path`) and characters Windows forbids become `_`.
// ponytail: Windows reserved device names (CON, NUL, …) not handled; add if a user hits one.
fn folder_name(group_name: &str) -> String {
    let name: String = group_name
        .chars()
        .map(|c| if c.is_control() || r#"/\:*?"<>|"#.contains(c) { '_' } else { c })
        .collect();
    // Windows drops trailing dots/spaces; "." and ".." would point elsewhere
    let name = name.trim_end_matches(['.', ' ']).trim();
    if name.is_empty() { "Group".to_string() } else { name.to_string() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::image::NewImage;

    fn add(db: &Database, archive: &Path, id: &str, rel: &str, bytes: &[u8]) {
        let abs = archive.join(rel);
        std::fs::create_dir_all(abs.parent().unwrap()).unwrap();
        std::fs::write(&abs, bytes).unwrap();
        db.insert_image(&NewImage {
            id: id.into(),
            filename: abs.file_name().unwrap().to_string_lossy().into(),
            file_path: rel.into(),
            taken_at: None,
            width: None, height: None, file_size: None, has_exif: false,
            date_source: None, thumbnail_path: None, media_type: "image".into(),
            duration_ms: None, codec: None, rotation: None, web_path: None,
            latitude: None, longitude: None,
        }).unwrap();
    }

    /// Regression test: same-name photos overwrote each other, and the group name was
    /// used as a raw path (`../` escaped the chosen folder).
    #[test]
    fn export_keeps_every_photo_inside_dest() {
        let archive = tempfile::tempdir().unwrap();
        let out = tempfile::tempdir().unwrap();
        let dest = out.path().join("chosen");
        std::fs::create_dir_all(&dest).unwrap();
        let db = Database::new(&archive.path().join(".archivist/archivist.db")).unwrap();

        add(&db, archive.path(), "a", "2024/01 - January/IMG_0001.jpg", b"january");
        add(&db, archive.path(), "b", "2024/02 - February/IMG_0001.jpg", b"february");
        let group = db.create_group("../Trip: day 1").unwrap();
        db.add_image_to_group("a", group).unwrap();
        db.add_image_to_group("b", group).unwrap();
        // A folder with the group's name already there must not be written into
        std::fs::create_dir_all(dest.join(".._Trip_ day 1")).unwrap();
        std::fs::write(dest.join(".._Trip_ day 1/IMG_0001.jpg"), b"user file").unwrap();

        let result = export_group(&db, group, dest.to_str().unwrap(), archive.path().to_str().unwrap()).unwrap();

        assert_eq!((result.copied, result.errors.len()), (2, 0));
        let folder = Path::new(&result.dest_path);
        assert_eq!(folder, dest.join(".._Trip_ day 1-1"));
        let mut contents: Vec<Vec<u8>> = std::fs::read_dir(folder).unwrap()
            .map(|e| std::fs::read(e.unwrap().path()).unwrap())
            .collect();
        contents.sort();
        assert_eq!(contents, vec![b"february".to_vec(), b"january".to_vec()]);
        assert_eq!(std::fs::read(dest.join(".._Trip_ day 1/IMG_0001.jpg")).unwrap(), b"user file");
        assert_eq!(std::fs::read_dir(out.path()).unwrap().count(), 1, "nothing written outside the chosen folder");
    }

    #[test]
    fn folder_name_is_one_safe_segment() {
        assert_eq!(folder_name("Summer 2024"), "Summer 2024");
        assert_eq!(folder_name("a/b\\c:d"), "a_b_c_d");
        assert_eq!(folder_name(".."), "Group");
        assert_eq!(folder_name("  "), "Group");
        assert_eq!(folder_name("Trip..."), "Trip");
    }
}
