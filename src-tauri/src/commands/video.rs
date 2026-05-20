use std::path::PathBuf;
use serde::Serialize;
use crate::error::AppError;

#[derive(Debug, Serialize)]
pub struct VideoStub {
    pub id: String,
    pub file_path: String,
}

pub fn save_video_thumbnail_impl(
    image_id: &str,
    jpeg_bytes: Vec<u8>,
    archive_path: &str,
    db: &crate::db::Database,
) -> Result<String, AppError> {
    let thumb_dir = PathBuf::from(archive_path).join(".archivist/thumbnails");
    std::fs::create_dir_all(&thumb_dir).map_err(|e| AppError::FileWrite {
        path: thumb_dir.to_string_lossy().to_string(),
        message: e.to_string(),
    })?;

    let filename = format!("{}.jpg", image_id);
    let abs_path = thumb_dir.join(&filename);
    let rel_path = format!(".archivist/thumbnails/{}", filename);

    std::fs::write(&abs_path, &jpeg_bytes).map_err(|e| AppError::FileWrite {
        path: abs_path.to_string_lossy().to_string(),
        message: e.to_string(),
    })?;

    db.update_thumbnail_path(image_id, &rel_path)?;
    Ok(rel_path)
}

pub fn get_videos_needing_thumbnails_impl(
    db: &crate::db::Database,
) -> Result<Vec<VideoStub>, AppError> {
    db.get_videos_without_thumbnail()
}
