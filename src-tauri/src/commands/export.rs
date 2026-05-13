use std::path::Path;
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub copied: usize,
    pub errors: Vec<String>,
    pub dest_path: String,
}

pub fn export_group(
    db: &Database,
    group_id: i64,
    dest_path: &str,
    archive_root: &str,
) -> Result<ExportResult, AppError> {
    let image_ids = db.get_images_in_group(group_id)?;
    
    let mut copied = 0;
    let mut errors = Vec::new();
    
    let dest = Path::new(dest_path);
    
    if let Err(e) = std::fs::create_dir_all(dest) {
        return Err(AppError::FileWrite {
            path: dest_path.to_string(),
            message: format!("Failed to create directory: {}", e),
        });
    }

    for image_id in image_ids {
        if let Some(image) = db.get_image(&image_id)? {
            let src = Path::new(archive_root).join(&image.file_path);
            let dst = dest.join(&image.filename);
            
            if src.exists() {
                match std::fs::copy(&src, &dst) {
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
        dest_path: dest_path.to_string(),
    })
}