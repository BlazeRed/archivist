use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use chrono::Utc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: i64,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupWithCount {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub image_count: i64,
    pub cover_image_id: Option<String>,
    pub cover_thumbnail_path: Option<String>,
}

impl super::Database {
    pub fn create_group(&self, name: &str) -> Result<i64, super::AppError> {
        let conn = self.connection();
        let created_at = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO groups (name, created_at) VALUES (?1, ?2)",
            params![name, created_at],
        )?;

        Ok(conn.last_insert_rowid())
    }

    pub fn get_group(&self, id: i64) -> Result<Option<Group>, super::AppError> {
        let conn = self.connection();
        
        let group = conn.query_row(
            "SELECT id, name, created_at FROM groups WHERE id = ?1",
            [id],
            |row| Ok(Group {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        ).optional()?;

        Ok(group)
    }

    pub fn get_all_groups(&self) -> Result<Vec<GroupWithCount>, super::AppError> {
        let conn = self.connection();
        
        let mut stmt = conn.prepare(
            "SELECT g.id, g.name, g.created_at, COUNT(ig.image_id) as image_count,
                    g.cover_image_id,
                    COALESCE(
                        (SELECT i.thumbnail_path FROM images i WHERE i.id = g.cover_image_id),
                        (SELECT i.thumbnail_path FROM images i
                         JOIN image_groups ig2 ON ig2.image_id = i.id
                         WHERE ig2.group_id = g.id ORDER BY ig2.rowid ASC LIMIT 1)
                    ) as cover_thumbnail_path
             FROM groups g
             LEFT JOIN image_groups ig ON g.id = ig.group_id
             GROUP BY g.id
             ORDER BY g.created_at DESC"
        )?;

        let groups = stmt.query_map([], |row| {
            Ok(GroupWithCount {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                image_count: row.get(3)?,
                cover_image_id: row.get(4)?,
                cover_thumbnail_path: row.get(5)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        Ok(groups)
    }

    pub fn update_group(&self, id: i64, name: &str) -> Result<(), super::AppError> {
        let conn = self.connection();
        conn.execute(
            "UPDATE groups SET name = ?1 WHERE id = ?2",
            params![name, id],
        )?;
        Ok(())
    }

    pub fn delete_group(&self, id: i64) -> Result<(), super::AppError> {
        let conn = self.connection();
        conn.execute("DELETE FROM image_groups WHERE group_id = ?1", [id])?;
        conn.execute("DELETE FROM groups WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn add_image_to_group(&self, image_id: &str, group_id: i64) -> Result<(), super::AppError> {
        let conn = self.connection();
        conn.execute(
            "INSERT OR IGNORE INTO image_groups (image_id, group_id) VALUES (?1, ?2)",
            params![image_id, group_id],
        )?;
        Ok(())
    }

    pub fn remove_image_from_group(&self, image_id: &str, group_id: i64) -> Result<(), super::AppError> {
        let conn = self.connection();
        conn.execute(
            "DELETE FROM image_groups WHERE image_id = ?1 AND group_id = ?2",
            params![image_id, group_id],
        )?;
        Ok(())
    }

    pub fn get_images_in_group(&self, group_id: i64) -> Result<Vec<String>, super::AppError> {
        let conn = self.connection();

        let mut stmt = conn.prepare(
            "SELECT image_id FROM image_groups WHERE group_id = ?1"
        )?;

        let image_ids = stmt.query_map([group_id], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;

        Ok(image_ids)
    }

    pub fn set_group_cover(&self, group_id: i64, image_id: &str) -> Result<(), super::AppError> {
        let conn = self.connection();
        conn.execute(
            "UPDATE groups SET cover_image_id = ?1 WHERE id = ?2",
            params![image_id, group_id],
        )?;
        Ok(())
    }

    pub fn get_groups_for_image(&self, image_id: &str) -> Result<Vec<i64>, super::AppError> {
        let conn = self.connection();

        let mut stmt = conn.prepare(
            "SELECT group_id FROM image_groups WHERE image_id = ?1"
        )?;

        let group_ids = stmt.query_map([image_id], |row| row.get(0))?
            .collect::<Result<Vec<i64>, _>>()?;

        Ok(group_ids)
    }
}