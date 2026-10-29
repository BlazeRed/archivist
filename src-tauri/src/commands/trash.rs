use std::fs;
use std::path::Path;
use serde::Serialize;
use chrono::Utc;
use crate::error::AppError;
use crate::db::Database;
use crate::db::image::Image;
use crate::commands::import::destination_path;
use crate::commands::rescan::unique_dest;

/// Folder at the archive root holding trashed files. Archivist never deletes
/// from it: emptying it is left to the user, by hand.
pub const TRASH_DIR: &str = "Trash";

#[derive(Debug, Serialize)]
pub struct MoveResult {
    pub moved: usize,
    pub failed: usize,
}

pub fn trash_images(archive_path: &str, ids: &[String], db: &Database) -> Result<MoveResult, AppError> {
    let trash_dir = Path::new(archive_path).join(TRASH_DIR);
    create_dir(&trash_dir)?;
    let now = Utc::now().to_rfc3339();

    let mut result = MoveResult { moved: 0, failed: 0 };
    for id in ids {
        let ok = match db.get_image(id)? {
            Some(img) if img.trashed_at.is_none() => move_image(archive_path, db, &img, &trash_dir, Some(&now)),
            _ => false,
        };
        if ok { result.moved += 1 } else { result.failed += 1 }
    }
    Ok(result)
}

/// Moves trashed files back to the folder their date maps to (same rule as import),
/// so the original path never needs to be stored.
pub fn restore_images(archive_path: &str, ids: &[String], db: &Database) -> Result<MoveResult, AppError> {
    let mut result = MoveResult { moved: 0, failed: 0 };
    for id in ids {
        let ok = match db.get_image(id)? {
            Some(img) if img.trashed_at.is_some() => {
                let dest_dir = destination_path(archive_path, &img.taken_at);
                create_dir(Path::new(&dest_dir)).is_ok()
                    && move_image(archive_path, db, &img, Path::new(&dest_dir), None)
            }
            _ => false,
        };
        if ok { result.moved += 1 } else { result.failed += 1 }
    }
    Ok(result)
}

/// Lists trashed images. Rows whose file is gone were emptied from the Trash folder
/// by the user, so they are dropped from the DB (with their cached files) here:
/// the deletion was the user's own explicit act.
pub fn get_trashed_images(archive_path: &str, db: &Database) -> Result<Vec<Image>, AppError> {
    let root = Path::new(archive_path);
    let mut kept = Vec::new();
    for img in db.get_trashed_images()? {
        if root.join(&img.file_path).exists() {
            kept.push(img);
            continue;
        }
        db.delete_image(&img.id)?;
        for cached in [&img.thumbnail_path, &img.web_path].into_iter().flatten() {
            if cached.starts_with(".archivist/") {
                let _ = fs::remove_file(root.join(cached));
            }
        }
    }
    Ok(kept)
}

/// Renames the file into `dest_dir` and points its DB row there.
/// The rename is undone if the DB write fails, so file and row never disagree.
fn move_image(archive_path: &str, db: &Database, img: &Image, dest_dir: &Path, trashed_at: Option<&str>) -> bool {
    let src = Path::new(archive_path).join(&img.file_path);
    let Some(name) = src.file_name().map(|n| n.to_string_lossy().to_string()) else { return false };
    let dest = unique_dest(dest_dir, &name);
    if fs::rename(&src, &dest).is_err() { return false; }

    let rel = dest.strip_prefix(archive_path).map(|p| p.to_string_lossy().to_string());
    let final_name = dest.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or(name);
    let saved = match rel {
        Ok(rel) => db.set_image_location(&img.id, &rel, &final_name, trashed_at).is_ok(),
        Err(_) => false,
    };
    if !saved {
        let _ = fs::rename(&dest, &src);
    }
    saved
}

fn create_dir(dir: &Path) -> Result<(), AppError> {
    fs::create_dir_all(dir).map_err(|e| AppError::FileWrite {
        path: dir.to_string_lossy().to_string(),
        message: e.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::image::NewImage;

    fn setup(rel: &str) -> (tempfile::TempDir, String, Database) {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().to_str().unwrap().to_string();
        let db = Database::new(&dir.path().join(".archivist/archivist.db")).unwrap();
        let abs = dir.path().join(rel);
        fs::create_dir_all(abs.parent().unwrap()).unwrap();
        fs::write(&abs, b"photo").unwrap();
        db.insert_image(&NewImage {
            id: "img1".into(),
            filename: "a.jpg".into(),
            file_path: rel.into(),
            taken_at: Some("2024-03-10T12:00:00+00:00".into()),
            width: None, height: None, file_size: None, has_exif: true,
            date_source: None, thumbnail_path: None, media_type: "image".into(),
            duration_ms: None, codec: None, rotation: None, web_path: None,
            latitude: None, longitude: None,
        }).unwrap();
        (dir, archive, db)
    }

    #[test]
    fn trash_then_restore_round_trips_file_row_and_groups() {
        let (dir, archive, db) = setup("2024/03 - March/a.jpg");
        let group = db.create_group("Trip").unwrap();
        db.add_image_to_group("img1", group).unwrap();
        db.set_image_favourite("img1", true).unwrap();

        let r = trash_images(&archive, &["img1".into()], &db).unwrap();
        assert_eq!((r.moved, r.failed), (1, 0));
        assert!(dir.path().join("Trash/a.jpg").exists());
        assert!(!dir.path().join("2024/03 - March/a.jpg").exists());
        assert!(db.get_all_images().unwrap().is_empty());
        assert!(db.get_favourite_images().unwrap().is_empty());
        assert!(db.get_images_in_group(group).unwrap().is_empty());
        assert_eq!(get_trashed_images(&archive, &db).unwrap().len(), 1);

        let r = restore_images(&archive, &["img1".into()], &db).unwrap();
        assert_eq!((r.moved, r.failed), (1, 0));
        assert!(dir.path().join("2024/03 - March/a.jpg").exists());
        let img = db.get_image("img1").unwrap().unwrap();
        assert!(img.trashed_at.is_none());
        assert!(img.is_favourite);
        assert_eq!(db.get_images_in_group(group).unwrap(), vec!["img1".to_string()]);
    }

    #[test]
    fn restore_goes_to_date_folder_not_original_path() {
        let (dir, archive, db) = setup("misplaced/a.jpg");
        trash_images(&archive, &["img1".into()], &db).unwrap();
        restore_images(&archive, &["img1".into()], &db).unwrap();
        assert!(dir.path().join("2024/03 - March/a.jpg").exists());
    }

    #[test]
    fn file_emptied_by_hand_drops_its_row() {
        let (dir, archive, db) = setup("2024/03 - March/a.jpg");
        trash_images(&archive, &["img1".into()], &db).unwrap();
        fs::remove_file(dir.path().join("Trash/a.jpg")).unwrap();

        assert!(get_trashed_images(&archive, &db).unwrap().is_empty());
        assert!(db.get_image("img1").unwrap().is_none());
    }

    #[test]
    fn rescan_leaves_trash_alone() {
        let (dir, archive, db) = setup("2024/03 - March/a.jpg");
        trash_images(&archive, &["img1".into()], &db).unwrap();
        // A stray file dropped into Trash must not be imported either
        fs::write(dir.path().join("Trash/stray.jpg"), b"other").unwrap();

        let result = crate::commands::rescan_archive(&archive, &db).unwrap();

        assert_eq!(result.added, 0);
        assert!(result.missing.is_empty());
        assert!(dir.path().join("Trash/a.jpg").exists());
        assert!(db.get_image("img1").unwrap().unwrap().trashed_at.is_some());
    }
}
