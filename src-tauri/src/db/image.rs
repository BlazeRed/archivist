use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use chrono::Utc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Image {
    pub id: String,
    pub filename: String,
    pub file_path: String,
    pub taken_at: Option<String>,
    pub imported_at: String,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub file_size: Option<i64>,
    pub has_exif: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewImage {
    pub id: String,
    pub filename: String,
    pub file_path: String,
    pub taken_at: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub file_size: Option<i64>,
    pub has_exif: bool,
}

impl super::Database {
    pub fn insert_image(&self, image: &NewImage) -> Result<(), super::AppError> {
        let conn = self.connection();
        let imported_at = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT OR REPLACE INTO images (id, filename, file_path, taken_at, imported_at, width, height, file_size, has_exif)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                image.id,
                image.filename,
                image.file_path,
                image.taken_at,
                imported_at,
                image.width,
                image.height,
                image.file_size,
                image.has_exif as i32,
            ],
        )?;

        Ok(())
    }

    pub fn get_image(&self, id: &str) -> Result<Option<Image>, super::AppError> {
        let conn = self.connection();
        
        let mut stmt = conn.prepare(
            "SELECT id, filename, file_path, taken_at, imported_at, width, height, file_size, has_exif
             FROM images WHERE id = ?1"
        )?;

        let image = stmt.query_row([id], |row| {
            Ok(Image {
                id: row.get(0)?,
                filename: row.get(1)?,
                file_path: row.get(2)?,
                taken_at: row.get(3)?,
                imported_at: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
                file_size: row.get(7)?,
                has_exif: row.get::<_, i32>(8)? != 0,
            })
        }).optional()?;

        Ok(image)
    }

    pub fn get_all_images(&self) -> Result<Vec<Image>, super::AppError> {
        let conn = self.connection();
        
        let mut stmt = conn.prepare(
            "SELECT id, filename, file_path, taken_at, imported_at, width, height, file_size, has_exif
             FROM images ORDER BY taken_at DESC, imported_at DESC"
        )?;

        let images = stmt.query_map([], |row| {
            Ok(Image {
                id: row.get(0)?,
                filename: row.get(1)?,
                file_path: row.get(2)?,
                taken_at: row.get(3)?,
                imported_at: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
                file_size: row.get(7)?,
                has_exif: row.get::<_, i32>(8)? != 0,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        Ok(images)
    }

    pub fn get_images_by_date(&self, year: i32, month: Option<i32>) -> Result<Vec<Image>, super::AppError> {
        let conn = self.connection();
        
        let query = match month {
            Some(_) => {
                "SELECT id, filename, file_path, taken_at, imported_at, width, height, file_size, has_exif
                 FROM images 
                 WHERE strftime('%Y', taken_at) = ?1 AND strftime('%m', taken_at) = ?2
                 ORDER BY taken_at DESC"
            },
            None => {
                "SELECT id, filename, file_path, taken_at, imported_at, width, height, file_size, has_exif
                 FROM images 
                 WHERE strftime('%Y', taken_at) = ?1
                 ORDER BY taken_at DESC"
            }
        };

        let mut stmt = conn.prepare(query)?;

        let images = if let Some(m) = month {
            stmt.query_map(params![format!("{:04}", year), format!("{:02}", m)], |row| {
                Ok(Image {
                    id: row.get(0)?,
                    filename: row.get(1)?,
                    file_path: row.get(2)?,
                    taken_at: row.get(3)?,
                    imported_at: row.get(4)?,
                    width: row.get(5)?,
                    height: row.get(6)?,
                    file_size: row.get(7)?,
                    has_exif: row.get::<_, i32>(8)? != 0,
                })
            })?.collect::<Result<Vec<_>, _>>()?
        } else {
            stmt.query_map([format!("{:04}", year)], |row| {
                Ok(Image {
                    id: row.get(0)?,
                    filename: row.get(1)?,
                    file_path: row.get(2)?,
                    taken_at: row.get(3)?,
                    imported_at: row.get(4)?,
                    width: row.get(5)?,
                    height: row.get(6)?,
                    file_size: row.get(7)?,
                    has_exif: row.get::<_, i32>(8)? != 0,
                })
            })?.collect::<Result<Vec<_>, _>>()?
        };

        Ok(images)
    }

    pub fn delete_image(&self, id: &str) -> Result<(), super::AppError> {
        let conn = self.connection();
        conn.execute("DELETE FROM images WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn get_image_count(&self) -> Result<i64, super::AppError> {
        let conn = self.connection();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM images", [], |row| row.get(0))?;
        Ok(count)
    }

    pub fn image_exists(&self, id: &str) -> Result<bool, super::AppError> {
        let conn = self.connection();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM images WHERE id = ?1",
            [id],
            |row| row.get(0)
        )?;
        Ok(count > 0)
    }
}