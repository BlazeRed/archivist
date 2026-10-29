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

    /// DB of `archive_path`: the shared handle when it is the open archive,
    /// otherwise a fresh connection to that archive's own DB (import into another archive).
    pub fn db_for(&self, archive_path: &str) -> Result<Arc<Database>, crate::error::AppError> {
        let target = archive_path.trim_end_matches('/');
        let is_open = self
            .get_archive_path()
            .is_some_and(|open| open.trim_end_matches('/') == target);
        if is_open {
            return Ok(self.db());
        }
        let db_path = std::path::PathBuf::from(target).join(".archivist").join("archivist.db");
        Ok(Arc::new(Database::new(&db_path)?))
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Import into another archive must hit that archive's DB, never the open one.
    #[test]
    fn db_for_picks_destination_archive() {
        let open_dir = tempfile::tempdir().unwrap();
        let other_dir = tempfile::tempdir().unwrap();
        let open = open_dir.path().to_str().unwrap();
        let other = other_dir.path().to_str().unwrap();

        let state = AppState::new(open_dir.path().join("boot.db"), 0).unwrap();
        state.reinit_db(open).unwrap();
        state.set_archive_path(open.to_string());

        assert!(Arc::ptr_eq(&state.db_for(open).unwrap(), &state.db()));
        assert!(Arc::ptr_eq(&state.db_for(&format!("{open}/")).unwrap(), &state.db()));
        assert!(!Arc::ptr_eq(&state.db_for(other).unwrap(), &state.db()));
        assert!(other_dir.path().join(".archivist/archivist.db").exists());
    }
}
