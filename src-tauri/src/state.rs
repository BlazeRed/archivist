use std::sync::{Arc, Mutex, MutexGuard};
use crate::db::Database;

pub struct AppState {
    db: Mutex<Arc<Database>>,
    pub archive_path: Mutex<Option<String>>,
    media_port: u16,
}

/// Recovers the guard instead of panicking on a poisoned mutex — see
/// `db::lock_recover` for why refusing to recover would be worse.
fn lock_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| {
        eprintln!("warning: recovered from poisoned state mutex");
        poisoned.into_inner()
    })
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
        Arc::clone(&lock_recover(&self.db))
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
        *lock_recover(&self.db) = Arc::new(new_db);
        Ok(())
    }

    pub fn set_archive_path(&self, path: String) {
        let mut guard = lock_recover(&self.archive_path);
        *guard = Some(path);
    }

    pub fn get_archive_path(&self) -> Option<String> {
        lock_recover(&self.archive_path).clone()
    }
}