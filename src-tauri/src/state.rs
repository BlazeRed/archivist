use std::sync::Arc;
use crate::db::Database;

pub struct AppState {
    pub db: Arc<Database>,
    pub archive_path: std::sync::Mutex<Option<String>>,
}

impl AppState {
    pub fn new(db_path: std::path::PathBuf) -> Result<Self, crate::error::AppError> {
        let db = Database::new(&db_path)?;
        Ok(Self {
            db: Arc::new(db),
            archive_path: std::sync::Mutex::new(None),
        })
    }

    pub fn set_archive_path(&self, path: String) {
        let mut guard = self.archive_path.lock().unwrap();
        *guard = Some(path);
    }

    pub fn get_archive_path(&self) -> Option<String> {
        self.archive_path.lock().unwrap().clone()
    }
}