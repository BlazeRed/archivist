pub mod image;
pub mod group;

use rusqlite::{Connection, Result};
use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use crate::error::AppError;

pub struct Database {
    conn: Mutex<Connection>,
}

/// Recovers the guard instead of panicking on a poisoned mutex. A panic
/// elsewhere while the lock was held doesn't corrupt the SQLite connection
/// itself, so refusing to use it afterwards would only turn one isolated
/// panic into a permanently unusable database for the rest of the session.
fn lock_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| {
        eprintln!("warning: recovered from poisoned DB mutex");
        poisoned.into_inner()
    })
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
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        let db = Self { conn: Mutex::new(conn) };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<(), AppError> {
        let conn = lock_recover(&self.conn);
        
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
                has_exif INTEGER DEFAULT 0,
                date_source TEXT,
                thumbnail_path TEXT
            );

            CREATE TABLE IF NOT EXISTS groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                cover_image_id TEXT
            );

            CREATE TABLE IF NOT EXISTS image_groups (
                image_id TEXT NOT NULL,
                group_id INTEGER NOT NULL,
                PRIMARY KEY (image_id, group_id),
                FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_images_taken_at ON images(taken_at);
            CREATE INDEX IF NOT EXISTS idx_image_groups_group_id ON image_groups(group_id);
            "
        )?;

        // Migrations for existing DBs
        let _ = conn.execute("ALTER TABLE groups ADD COLUMN cover_image_id TEXT", []);
        let _ = conn.execute("ALTER TABLE images ADD COLUMN thumbnail_path TEXT", []);
        let _ = conn.execute("ALTER TABLE images ADD COLUMN date_source TEXT", []);
        let _ = conn.execute("ALTER TABLE images ADD COLUMN is_favourite INTEGER DEFAULT 0", []);
        let _ = conn.execute("ALTER TABLE images ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image'", []);
        let _ = conn.execute("ALTER TABLE images ADD COLUMN duration_ms INTEGER", []);
        let _ = conn.execute("ALTER TABLE images ADD COLUMN codec TEXT", []);
        let _ = conn.execute("ALTER TABLE images ADD COLUMN rotation INTEGER DEFAULT 0", []);
        let _ = conn.execute("ALTER TABLE images ADD COLUMN web_path TEXT", []);

        // On Linux, h264 videos previously marked web_compatible can't play in
        // WebKitGTK without gstreamer-libav. Reset them so the transcode queue
        // converts them to VP9 WebM.
        #[cfg(target_os = "linux")]
        let _ = conn.execute(
            "UPDATE images SET web_path = NULL WHERE codec = 'h264' AND web_path IS NOT NULL",
            [],
        );

        let _ = conn.execute(
            "UPDATE images SET date_source = CASE \
             WHEN has_exif = 1 THEN 'exif' \
             WHEN taken_at IS NOT NULL THEN 'mtime' \
             ELSE NULL END \
             WHERE date_source IS NULL",
            [],
        );

        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, AppError> {
        let conn = lock_recover(&self.conn);
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        match stmt.query_row([key], |row| row.get(0)) {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e)),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), AppError> {
        let conn = lock_recover(&self.conn);
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            [key, value],
        )?;
        Ok(())
    }

    pub fn connection(&self) -> MutexGuard<'_, Connection> {
        lock_recover(&self.conn)
    }
}