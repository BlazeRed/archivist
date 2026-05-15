use std::path::{Path, PathBuf};
use std::fs;
use image::GenericImageView;
use serde::Serialize;
use crate::error::AppError;
use crate::db::Database;
use crate::exif::{self, ExifResult};
use crate::commands::import::destination_path;

#[derive(Debug, Serialize)]
pub struct RescanResult {
    pub added: usize,
    pub removed: usize,
    pub repaired: usize,
    pub moved: usize,
}

pub fn rescan_archive(archive_path: &str, db: &Database) -> Result<RescanResult, AppError> {
    let root = Path::new(archive_path);

    if !root.exists() {
        return Err(AppError::ArchiveNotFound {
            path: archive_path.to_string(),
        });
    }

    let mut added = 0;
    let mut moved = 0;
    scan_archive_directory(root, archive_path, db, &mut added, &mut moved)?;

    // Prune pass — remove DB entries for files no longer on disk
    let all_paths = db.get_all_image_paths()?;
    let mut removed = 0;
    for (id, rel_path) in all_paths {
        let abs = Path::new(archive_path).join(&rel_path);
        if !abs.exists() {
            db.delete_image(&id)?;
            removed += 1;
        }
    }

    // Repair pass — re-extract dates for images without EXIF and relocate if misplaced
    let (repaired, repair_moved) = repair_missing_exif_dates(archive_path, db)?;
    moved += repair_moved;

    Ok(RescanResult { added, removed, repaired, moved })
}

pub fn run_migrations(archive_path: &str, db: &Database) -> Result<(), AppError> {
    repair_missing_exif_dates(archive_path, db)?;
    Ok(())
}

fn repair_missing_exif_dates(archive_path: &str, db: &Database) -> Result<(usize, usize), AppError> {
    let no_exif = db.get_images_without_exif()?;
    let mut repaired = 0;
    let mut moved = 0;
    for (id, rel_path) in no_exif {
        let abs = Path::new(archive_path).join(&rel_path);
        if abs.exists() {
            if let ExifResult::FromExif(dt) = exif::extract_date(&abs) {
                let taken_at = Some(dt.to_rfc3339());
                db.update_image_date(&id, Some(dt), true)?;
                repaired += 1;

                let filename = abs.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                if let Some((_new_abs, new_rel)) =
                    relocate_if_misplaced(archive_path, &abs, &taken_at, &filename)
                {
                    db.update_image_path(&id, &new_rel)?;
                    moved += 1;
                }
            }
        }
    }
    Ok((repaired, moved))
}

fn unique_dest(dir: &Path, filename: &str) -> PathBuf {
    let dest = dir.join(filename);
    if !dest.exists() { return dest; }
    let stem = Path::new(filename).file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext  = Path::new(filename).extension().and_then(|e| e.to_str()).unwrap_or("");
    let mut i = 1u32;
    loop {
        let name = if ext.is_empty() {
            format!("{stem}-{i}")
        } else {
            format!("{stem}-{i}.{ext}")
        };
        let candidate = dir.join(&name);
        if !candidate.exists() { return candidate; }
        i += 1;
    }
}

fn relocate_if_misplaced(
    archive_root: &str,
    abs_path: &Path,
    taken_at: &Option<String>,
    filename: &str,
) -> Option<(PathBuf, String)> {
    let expected_folder = destination_path(archive_root, taken_at);
    let expected_dir = Path::new(&expected_folder);
    let current_dir = abs_path.parent()?;

    if current_dir == expected_dir {
        return None;
    }

    fs::create_dir_all(expected_dir).ok()?;
    let dest = unique_dest(expected_dir, filename);
    fs::rename(abs_path, &dest).ok()?;

    let new_rel = dest.strip_prefix(archive_root)
        .map(|p| p.to_string_lossy().to_string())
        .ok()?;
    Some((dest, new_rel))
}

fn scan_archive_directory(
    dir: &Path,
    archive_root: &str,
    db: &Database,
    added: &mut usize,
    moved: &mut usize,
) -> Result<(), AppError> {
    let entries = fs::read_dir(dir).map_err(|e| AppError::FileRead {
        path: dir.to_string_lossy().to_string(),
        message: e.to_string(),
    })?;

    for entry in entries.flatten() {
        let path = entry.path();

        if path.is_dir() {
            let dir_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if dir_name == ".archivist" {
                continue;
            }
            scan_archive_directory(&path, archive_root, db, added, moved)?;
        } else if is_image_file(&path) {
            if let Ok(image_id) = compute_image_id(&path) {
                if !db.image_exists(&image_id)? {
                    let filename = path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    let exif_result = exif::extract_date(&path);
                    let (taken_at, has_exif) = match exif_result {
                        ExifResult::FromExif(dt) => (Some(dt.to_rfc3339()), true),
                        _ => (None, false),
                    };

                    let (final_path, rel_path) = if let Some((new_abs, new_rel)) =
                        relocate_if_misplaced(archive_root, &path, &taken_at, &filename)
                    {
                        *moved += 1;
                        (new_abs, new_rel)
                    } else {
                        let rel = path.strip_prefix(archive_root)
                            .map(|p| p.to_string_lossy().to_string())
                            .unwrap_or_else(|_| path.to_string_lossy().to_string());
                        (path.clone(), rel)
                    };

                    let (width, height) = get_image_dimensions(&final_path).unwrap_or((None, None));
                    let file_size = fs::metadata(&final_path).ok().map(|m| m.len() as i64);
                    let final_filename = final_path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or(filename);

                    let new_image = crate::db::image::NewImage {
                        id: image_id,
                        filename: final_filename,
                        file_path: rel_path,
                        taken_at,
                        width: width.map(|w| w as i32),
                        height: height.map(|h| h as i32),
                        file_size,
                        has_exif,
                        thumbnail_path: None,
                    };

                    db.insert_image(&new_image)?;
                    *added += 1;
                }
            }
        }
    }

    Ok(())
}

fn is_image_file(path: &Path) -> bool {
    let ext = path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());

    matches!(ext.as_deref(), Some("jpg") | Some("jpeg") | Some("png") | Some("gif") | Some("webp") | Some("tiff") | Some("tif") | Some("bmp") | Some("heic") | Some("heif"))
}

fn compute_image_id(path: &Path) -> Result<String, AppError> {
    use sha2::{Sha256, Digest};

    let mut file = fs::File::open(path).map_err(|e| AppError::FileRead {
        path: path.to_string_lossy().to_string(),
        message: e.to_string(),
    })?;

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        use std::io::Read;
        let bytes_read = file.read(&mut buffer).map_err(|e| AppError::FileRead {
            path: path.to_string_lossy().to_string(),
            message: e.to_string(),
        })?;

        if bytes_read == 0 {
            break;
        }

        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hex::encode(hasher.finalize()))
}

fn get_image_dimensions(path: &Path) -> Result<(Option<u32>, Option<u32>), AppError> {
    match image::open(path) {
        Ok(img) => {
            let (w, h) = img.dimensions();
            Ok((Some(w), Some(h)))
        }
        Err(_) => Ok((None, None)),
    }
}
