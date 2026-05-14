use std::path::Path;
use std::fs;
use image::GenericImageView;
use serde::Serialize;
use crate::error::AppError;
use crate::db::Database;

#[derive(Debug, Serialize)]
pub struct RescanResult {
    pub added: usize,
    pub removed: usize,
}

pub fn rescan_archive(archive_path: &str, db: &Database) -> Result<RescanResult, AppError> {
    let root = Path::new(archive_path);

    if !root.exists() {
        return Err(AppError::ArchiveNotFound {
            path: archive_path.to_string(),
        });
    }

    let mut added = 0;
    scan_archive_directory(root, archive_path, db, &mut added)?;

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

    Ok(RescanResult { added, removed })
}

fn scan_archive_directory(
    dir: &Path,
    archive_root: &str,
    db: &Database,
    added: &mut usize,
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
            scan_archive_directory(&path, archive_root, db, added)?;
        } else if is_image_file(&path) {
            if let Ok(image_id) = compute_image_id(&path) {
                if !db.image_exists(&image_id)? {
                    let filename = path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    
                    let relative_path = path.strip_prefix(archive_root)
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|_| path.to_string_lossy().to_string());

                    let (width, height) = get_image_dimensions(&path).unwrap_or((None, None));
                    let file_size = fs::metadata(&path).ok().map(|m| m.len() as i64);

                    let new_image = crate::db::image::NewImage {
                        id: image_id,
                        filename,
                        file_path: relative_path,
                        taken_at: None,
                        width: width.map(|w| w as i32),
                        height: height.map(|h| h as i32),
                        file_size,
                        has_exif: false,
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