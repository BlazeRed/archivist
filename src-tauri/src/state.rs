use std::sync::{Arc, Mutex};
use crate::db::Database;

pub struct AppState {
    db: Mutex<Arc<Database>>,
    pub archive_path: Mutex<Option<String>>,
    media_port: u16,
}

impl AppState {
    pub fn new(db_path: std::path::PathBuf, media_port: u16) -> Result<Self, crate::error::AppError> {
        let db = Database::new(&db_path)?;
        Ok(Self {
            db: Mutex::new(Arc::new(db)),
            archive_path: Mutex::new(None),
            media_port,
        })
    }

    pub fn media_port(&self) -> u16 {
        self.media_port
    }

    pub fn db(&self) -> Arc<Database> {
        Arc::clone(&self.db.lock().expect("mutex poisoned"))
    }

    pub fn reinit_db(&self, archive_path: &str) -> Result<(), crate::error::AppError> {
        let thumbnails_dir = std::path::PathBuf::from(archive_path)
            .join(".archivist")
            .join("thumbnails");
        std::fs::create_dir_all(&thumbnails_dir)
            .map_err(|e| crate::error::AppError::FileWrite {
                path: thumbnails_dir.to_string_lossy().to_string(),
                message: e.to_string(),
            })?;
        let db_path = std::path::PathBuf::from(archive_path)
            .join(".archivist")
            .join("archivist.db");
        let new_db = Database::new(&db_path)?;
        *self.db.lock().expect("mutex poisoned") = Arc::new(new_db);
        Ok(())
    }

    pub fn set_archive_path(&self, path: String) {
        let mut guard = self.archive_path.lock().expect("mutex poisoned");
        *guard = Some(path);
    }

    pub fn get_archive_path(&self) -> Option<String> {
        self.archive_path.lock().expect("mutex poisoned").clone()
    }
}