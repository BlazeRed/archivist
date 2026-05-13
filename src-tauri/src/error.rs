use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("File read error: {path} - {message}")]
    FileRead { path: String, message: String },

    #[error("File write error: {path} - {message}")]
    FileWrite { path: String, message: String },

    #[error("EXIF corrupted: {filename} - {reason}")]
    ExifCorrupted { filename: String, reason: String },

    #[error("Archive not found: {path}")]
    ArchiveNotFound { path: String },

    #[error("Image not found: {id}")]
    ImageNotFound { id: String },

    #[error("Group not found: {id}")]
    GroupNotFound { id: i64 },
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}