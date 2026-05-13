pub mod image;
pub mod group;

use rusqlite::{Connection, Result};
use std::path::Path;
use std::sync::Mutex;
use crate::error::AppError;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: &Path) -> Result<Self, AppError> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::FileWrite {
                    path: parent.to_string_lossy().to_string(),
                    message: e.to_string(),
                })?;
        }

        let conn = Connection::open(db_path)?;
        let db = Self { conn: Mutex::new(conn) };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS images (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                taken_at TEXT,
                imported_at TEXT NOT NULL,
                width INTEGER,
                height INTEGER,
                file_size INTEGER,
                has_exif INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS image_groups (
                image_id TEXT NOT NULL,
                group_id INTEGER NOT NULL,
                PRIMARY KEY (image_id, group_id),
                FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_images_taken_at ON images(taken_at);
            CREATE INDEX IF NOT EXISTS idx_image_groups_group_id ON image_groups(group_id);
            "
        )?;

        Ok(())
    }

    pub fn connection(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap()
    }
}