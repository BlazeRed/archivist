use std::path::{Path, PathBuf};
use std::fs;
use std::sync::atomic::{AtomicUsize, Ordering};
use serde::Serialize;
use rayon::prelude::*;
use tauri::Emitter;
use crate::error::AppError;
use crate::db::Database;
use crate::exif::{self, ExifResult};
use crate::commands::import::{destination_path, classify_media};
use crate::hasher;
use crate::thumbnail::{self, ThumbnailSize};

#[derive(Debug, Serialize)]
pub struct RescanResult {
    pub added: usize,
    pub missing: Vec<MissingImage>,
    pub repaired: usize,
    pub moved: usize,
    pub thumbnailed: usize,
    pub folders_removed: usize,
    pub gps_repaired: usize,
}

/// A DB record whose file could not be found on disk during rescan.
/// Never deleted automatically — the caller must confirm via `remove_missing_images`.
#[derive(Debug, Serialize)]
pub struct MissingImage {
    pub id: String,
    pub filename: String,
}

struct DiscoveredFile {
    original_path: PathBuf,
    id: String,
    exif_result: ExifResult,
    dims: (Option<u32>, Option<u32>),
    duration_ms: Option<i64>,
    video_creation_time: Option<chrono::DateTime<chrono::Utc>>,
    file_size: Option<i64>,
    filename: String,
    media_type: String,
    codec: Option<String>,
    rotation: Option<i32>,
    latitude: Option<f64>,
    longitude: Option<f64>,
}

pub fn rescan_archive(archive_path: &str, db: &Database) -> Result<RescanResult, AppError> {
    let root = Path::new(archive_path);

    if !root.exists() {
        return Err(AppError::ArchiveNotFound {
            path: archive_path.to_string(),
        });
    }

    // Phase 1: collect all image paths (serial walk)
    let candidates = collect_image_paths(root)?;

    // Phase 2: parallel hash + EXIF + dims (skip already-known files)
    let discovered: Vec<DiscoveredFile> = candidates
        .par_iter()
        .filter_map(|path| {
            let id = compute_image_id(path).ok()?;
            if db.image_exists(&id).ok()? { return None; }
            let filename = path.file_name()?.to_str()?.to_string();
            let media_type = classify_media(path).unwrap_or("image").to_string();
            let exif_result = exif::extract_date(path);
            let (dims, duration_ms, video_creation_time, codec, rotation) = if media_type == "video" {
                let vm = crate::video_meta::parse_video_meta(path);
                ((vm.width, vm.height), vm.duration_ms, vm.creation_time, vm.codec, vm.rotation)
            } else {
                (get_image_dimensions(path).unwrap_or((None, None)), None, None, None, None)
            };
            let file_size = fs::metadata(path).ok().map(|m| m.len() as i64);
            let (latitude, longitude) = if media_type == "video" {
                (None, None)
            } else {
                match exif::extract_gps(path) {
                    Some((lat, lon)) => (Some(lat), Some(lon)),
                    None => (None, None),
                }
            };
            Some(DiscoveredFile { original_path: path.clone(), id, exif_result, dims, duration_ms, video_creation_time, file_size, filename, media_type, codec, rotation, latitude, longitude })
        })
        .collect();

    // Phase 3: serial — relocate + thumbnail + DB insert
    let mut added = 0usize;
    let mut moved = 0usize;

    for disc in discovered {
        let has_exif = disc.exif_result.has_exif();
        // For videos: prefer atom creation_time over mtime (but keep exif/filename if present)
        let (taken_at, date_source) = if disc.media_type == "video" {
            let exif_src = disc.exif_result.date_source_label();
            match exif_src {
                Some("exif") | Some("filename") => (
                    disc.exif_result.datetime().map(|dt| dt.to_rfc3339()),
                    exif_src.map(|s| s.to_string()),
                ),
                _ => {
                    if let Some(ct) = disc.video_creation_time {
                        (Some(ct.to_rfc3339()), Some("atom".to_string()))
                    } else {
                        (
                            disc.exif_result.datetime().map(|dt| dt.to_rfc3339()),
                            exif_src.map(|s| s.to_string()),
                        )
                    }
                }
            }
        } else {
            (disc.exif_result.datetime().map(|dt| dt.to_rfc3339()), disc.exif_result.date_source_label().map(|s| s.to_string()))
        };

        let (final_path, rel_path) = if let Some((new_abs, new_rel)) =
            relocate_if_misplaced(archive_path, &disc.original_path, &taken_at, &disc.filename)
        {
            moved += 1;
            (new_abs, new_rel)
        } else {
            let rel = disc.original_path
                .strip_prefix(archive_path)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| disc.original_path.to_string_lossy().to_string());
            (disc.original_path.clone(), rel)
        };

        let thumbnail_path = ensure_thumbnail(archive_path, &disc.id, &final_path);
        let final_filename = final_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or(disc.filename);

        let web_path = if disc.media_type == "video" {
            let full_path = PathBuf::from(&rel_path);
            if crate::video_meta::is_web_compatible(&disc.codec, &full_path) {
                Some(rel_path.clone())
            } else {
                None
            }
        } else {
            None
        };

        let new_image = crate::db::image::NewImage {
            id: disc.id,
            filename: final_filename,
            file_path: rel_path,
            taken_at,
            width: disc.dims.0.map(|w| w as i32),
            height: disc.dims.1.map(|h| h as i32),
            file_size: disc.file_size,
            has_exif,
            date_source,
            thumbnail_path,
            media_type: disc.media_type,
            duration_ms: disc.duration_ms,
            codec: disc.codec,
            rotation: disc.rotation,
            web_path,
            latitude: disc.latitude,
            longitude: disc.longitude,
        };

        db.insert_image(&new_image)?;
        added += 1;
    }

    // Detect (but never auto-delete) DB entries whose file is gone from disk.
    // Deletion requires explicit user confirmation via `remove_missing_images`.
    let all_paths = db.get_all_image_paths()?;
    let mut missing = Vec::new();
    for (id, rel_path) in all_paths {
        let abs = Path::new(archive_path).join(&rel_path);
        if !abs.exists() {
            let filename = Path::new(&rel_path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or(rel_path);
            missing.push(MissingImage { id, filename });
        }
    }

    // Repair: re-extract EXIF for images that lack it
    let (repaired, repair_moved) = repair_missing_exif_dates(archive_path, db)?;
    moved += repair_moved;

    // Thumbnails: generate for images that lack one
    let thumbnailed = repair_missing_thumbnails(archive_path, db)?;

    // Backfill: update metadata for existing videos that have null width (imported before video_meta support)
    backfill_video_metadata(archive_path, db)?;

    // Backfill: extract GPS for images imported before this feature existed
    let gps_repaired = repair_missing_gps(archive_path, db)?;

    let folders_removed = remove_empty_dirs(root)?;
    Ok(RescanResult { added, missing, repaired, moved, thumbnailed, folders_removed, gps_repaired })
}

#[derive(Debug, Serialize)]
pub struct RegenerateThumbnailsResult {
    pub regenerated: usize,
    pub failed: usize,
}

#[derive(Debug, Clone, Serialize)]
struct RegenProgressPayload {
    current: usize,
    total: usize,
}

/// Force-rebuilds every image thumbnail from its source file, overwriting
/// the existing JPEG in place. Used after a thumbnail-generation bugfix
/// (e.g. EXIF orientation) to fix thumbnails that already exist on disk —
/// `rescan_archive`'s own thumbnail repair only fills in *missing* ones.
/// Thumbnail paths are deterministic (`.archivist/thumbnails/{id}.jpg`), so
/// this never touches the DB. Videos are skipped: their thumbnails are
/// ffmpeg frame grabs, unaffected by EXIF-orientation bugs.
// ponytail: no isolated unit test here (needs a `tauri::AppHandle` for the
// progress emit, which means enabling tauri's "test"/mock_app feature just
// for this) — matches this file's existing convention of not unit-testing
// batch helpers (`ensure_thumbnail`, `repair_missing_thumbnails`,
// `backfill_video_metadata` have none either). The per-item logic it calls
// (`generate_thumbnail` + `apply_exif_orientation`) is unit-tested directly
// in thumbnail.rs. Add a mock_app-based test if this function grows real
// branching logic beyond "loop, overwrite, count".
pub fn regenerate_thumbnails(
    archive_path: &str,
    db: &Database,
    app: &tauri::AppHandle,
) -> Result<RegenerateThumbnailsResult, AppError> {
    let images: Vec<_> = db.get_all_images()?
        .into_iter()
        .filter(|img| img.media_type == "image")
        .collect();

    let thumb_dir = Path::new(archive_path).join(".archivist/thumbnails");
    fs::create_dir_all(&thumb_dir).map_err(|e| AppError::FileWrite {
        path: thumb_dir.to_string_lossy().to_string(),
        message: e.to_string(),
    })?;

    let total = images.len();
    let counter = AtomicUsize::new(0);
    let size = ThumbnailSize::medium();

    let results: Vec<bool> = images
        .par_iter()
        .map(|img| {
            let source = Path::new(archive_path).join(&img.file_path);
            let dest = thumb_dir.join(format!("{}.jpg", img.id));
            let ok = thumbnail::generate_thumbnail(&source, &dest, &size).is_ok();

            let current = counter.fetch_add(1, Ordering::Relaxed) + 1;
            let _ = app.emit("regen_thumbnails_progress", RegenProgressPayload { current, total });

            ok
        })
        .collect();

    let regenerated = results.iter().filter(|ok| **ok).count();
    let failed = results.len() - regenerated;

    Ok(RegenerateThumbnailsResult { regenerated, failed })
}

/// Deletes DB records for images the user has explicitly confirmed are gone.
/// Called only after the frontend shows `RescanResult.missing` and the user confirms.
pub fn remove_missing_images(ids: &[String], db: &Database) -> Result<usize, AppError> {
    for id in ids {
        db.delete_image(id)?;
    }
    Ok(ids.len())
}

pub fn run_migrations(archive_path: &str, db: &Database) -> Result<(), AppError> {
    repair_missing_exif_dates(archive_path, db)?;
    repair_missing_gps(archive_path, db)?;
    Ok(())
}

fn collect_image_paths(dir: &Path) -> Result<Vec<PathBuf>, AppError> {
    let mut paths = Vec::new();
    collect_image_paths_inner(dir, &mut paths)?;
    Ok(paths)
}

fn collect_image_paths_inner(dir: &Path, paths: &mut Vec<PathBuf>) -> Result<(), AppError> {
    let entries = fs::read_dir(dir).map_err(|e| AppError::FileRead {
        path: dir.to_string_lossy().to_string(),
        message: e.to_string(),
    })?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let dir_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if dir_name == ".archivist" { continue; }
            collect_image_paths_inner(&path, paths)?;
        } else if is_image_file(&path) {
            paths.push(path);
        }
    }
    Ok(())
}

fn ensure_thumbnail(archive_root: &str, image_id: &str, image_path: &Path) -> Option<String> {
    let rel = format!(".archivist/thumbnails/{}.jpg", image_id);
    let thumb_abs = Path::new(archive_root)
        .join(".archivist/thumbnails")
        .join(format!("{}.jpg", image_id));

    if thumb_abs.exists() {
        return Some(rel);
    }

    let size = ThumbnailSize::medium();
    if classify_media(image_path) == Some("video") {
        match thumbnail::generate_video_thumbnail(image_path, &thumb_abs, &size) {
            Ok(()) => Some(rel),
            Err(_) => None,
        }
    } else {
        match thumbnail::generate_thumbnail(image_path, &thumb_abs, &size) {
            Ok(()) => Some(rel),
            Err(_) => None,
        }
    }
}

fn repair_missing_thumbnails(archive_path: &str, db: &Database) -> Result<usize, AppError> {
    let no_thumb = db.get_images_without_thumbnail()?;

    // Phase: parallel thumbnail generation
    let results: Vec<(String, Option<String>)> = no_thumb
        .par_iter()
        .filter_map(|(id, rel_path)| {
            let abs = Path::new(archive_path).join(rel_path);
            if !abs.exists() { return None; }
            let thumb_rel = ensure_thumbnail(archive_path, id, &abs);
            Some((id.clone(), thumb_rel))
        })
        .collect();

    // Serial DB updates
    let mut thumbnailed = 0usize;
    for (id, thumb_rel) in results {
        if let Some(rel) = thumb_rel {
            db.update_thumbnail_path(&id, &rel)?;
            thumbnailed += 1;
        }
    }

    Ok(thumbnailed)
}

fn repair_missing_exif_dates(archive_path: &str, db: &Database) -> Result<(usize, usize), AppError> {
    let no_exif = db.get_images_without_exif()?;

    // Phase: parallel EXIF re-extraction (only keep results where real EXIF found)
    let extracted: Vec<(String, PathBuf, ExifResult)> = no_exif
        .par_iter()
        .filter_map(|(id, rel_path)| {
            let abs = Path::new(archive_path).join(rel_path);
            if !abs.exists() { return None; }
            let result = exif::extract_date(&abs);
            if matches!(result, ExifResult::FromExif(_)) {
                Some((id.clone(), abs, result))
            } else {
                None
            }
        })
        .collect();

    // Serial: DB update + relocation
    let mut repaired = 0usize;
    let mut moved = 0usize;

    for (id, abs, exif_result) in extracted {
        let dt = match &exif_result {
            ExifResult::FromExif(dt) => *dt,
            _ => unreachable!(),
        };
        let taken_at_str = Some(dt.to_rfc3339());
        db.update_image_date(&id, Some(dt), true, Some("exif".to_string()))?;
        repaired += 1;

        let filename = abs.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if let Some((_, new_rel)) = relocate_if_misplaced(archive_path, &abs, &taken_at_str, &filename) {
            db.update_image_path(&id, &new_rel)?;
            moved += 1;
        }
    }

    Ok((repaired, moved))
}

fn repair_missing_gps(archive_path: &str, db: &Database) -> Result<usize, AppError> {
    let no_gps = db.get_images_without_gps()?;

    let extracted: Vec<(String, f64, f64)> = no_gps
        .par_iter()
        .filter_map(|(id, rel_path)| {
            let abs = Path::new(archive_path).join(rel_path);
            if !abs.exists() { return None; }
            let (lat, lon) = exif::extract_gps(&abs)?;
            Some((id.clone(), lat, lon))
        })
        .collect();

    let mut repaired = 0usize;
    for (id, lat, lon) in extracted {
        db.update_image_gps(&id, Some(lat), Some(lon))?;
        repaired += 1;
    }
    Ok(repaired)
}

fn unique_dest(dir: &Path, filename: &str) -> PathBuf {
    let dest = dir.join(filename);
    if !dest.exists() { return dest; }
    let stem = Path::new(filename).file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext  = Path::new(filename).extension().and_then(|e| e.to_str()).unwrap_or("");
    let mut i = 1u32;
    loop {
        let name = if ext.is_empty() {
            format!("{stem}-{i}")
        } else {
            format!("{stem}-{i}.{ext}")
        };
        let candidate = dir.join(&name);
        if !candidate.exists() { return candidate; }
        i += 1;
    }
}

fn relocate_if_misplaced(
    archive_root: &str,
    abs_path: &Path,
    taken_at: &Option<String>,
    filename: &str,
) -> Option<(PathBuf, String)> {
    let expected_folder = destination_path(archive_root, taken_at);
    let expected_dir = Path::new(&expected_folder);
    let current_dir = abs_path.parent()?;

    if current_dir == expected_dir {
        return None;
    }

    fs::create_dir_all(expected_dir).ok()?;
    let dest = unique_dest(expected_dir, filename);
    fs::rename(abs_path, &dest).ok()?;

    let new_rel = dest.strip_prefix(archive_root)
        .map(|p| p.to_string_lossy().to_string())
        .ok()?;
    Some((dest, new_rel))
}

fn is_image_file(path: &Path) -> bool {
    classify_media(path).is_some()
}

fn collect_dirs_inner(dir: &Path, dirs: &mut Vec<PathBuf>) -> Result<(), AppError> {
    let entries = fs::read_dir(dir).map_err(|e| AppError::FileRead {
        path: dir.to_string_lossy().to_string(),
        message: e.to_string(),
    })?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name == ".archivist" { continue; }
            collect_dirs_inner(&path, dirs)?;
            dirs.push(path); // push after recursing = children before parents
        }
    }
    Ok(())
}

fn remove_empty_dirs(root: &Path) -> Result<usize, AppError> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    collect_dirs_inner(root, &mut dirs)?;
    let mut removed = 0usize;
    for dir in dirs {
        let mut entries = fs::read_dir(&dir).map_err(|e| AppError::FileRead {
            path: dir.to_string_lossy().to_string(),
            message: e.to_string(),
        })?;
        if entries.next().is_none() {
            fs::remove_dir(&dir).map_err(|e| AppError::FileRead {
                path: dir.to_string_lossy().to_string(),
                message: e.to_string(),
            })?;
            removed += 1;
        }
    }
    Ok(removed)
}

fn compute_image_id(path: &Path) -> Result<String, AppError> {
    hasher::compute_hash(path)
}

fn get_image_dimensions(path: &Path) -> Result<(Option<u32>, Option<u32>), AppError> {
    match thumbnail::get_image_dimensions(path) {
        Ok((w, h)) => Ok((Some(w), Some(h))),
        Err(_) => Ok((None, None)),
    }
}

fn backfill_video_metadata(archive_path: &str, db: &Database) -> Result<(), AppError> {
    let stubs = db.get_videos_without_metadata()?;
    for (id, rel_path) in stubs {
        let abs = Path::new(archive_path).join(&rel_path);
        if !abs.exists() { continue; }
        let vm = crate::video_meta::parse_video_meta(&abs);
        if vm.width.is_some() || vm.duration_ms.is_some() || vm.codec.is_some() {
            let rel_path_obj = Path::new(&rel_path);
            let web_path = if crate::video_meta::is_web_compatible(&vm.codec, rel_path_obj) {
                Some(rel_path.as_str())
            } else {
                None
            };
            let _ = db.update_video_meta_fields(
                &id,
                vm.width,
                vm.height,
                vm.duration_ms,
                vm.codec.as_deref(),
                vm.rotation,
                web_path,
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::image::NewImage;

    fn ghost_image(id: &str) -> NewImage {
        NewImage {
            id: id.to_string(),
            filename: format!("{id}.jpg"),
            file_path: format!("2026/01 - January/{id}.jpg"),
            taken_at: None,
            width: None,
            height: None,
            file_size: None,
            has_exif: false,
            date_source: None,
            thumbnail_path: None,
            media_type: "image".to_string(),
            duration_ms: None,
            codec: None,
            rotation: None,
            web_path: None,
            latitude: None,
            longitude: None,
        }
    }

    /// Regression test for the silent-deletion bug: a DB record whose file
    /// is missing from disk must be reported, never deleted, by a plain
    /// rescan. Deletion only happens via `remove_missing_images`, after the
    /// frontend has shown the user an explicit confirmation.
    #[test]
    fn rescan_reports_missing_without_deleting() {
        let archive_dir = tempfile::tempdir().unwrap();
        let archive_path = archive_dir.path().to_str().unwrap().to_string();
        let db = Database::new(&archive_dir.path().join(".archivist/archivist.db")).unwrap();

        db.insert_image(&ghost_image("ghost")).unwrap();

        let result = rescan_archive(&archive_path, &db).unwrap();

        assert_eq!(result.missing.len(), 1);
        assert_eq!(result.missing[0].id, "ghost");
        assert!(db.get_image("ghost").unwrap().is_some(), "rescan must not delete without explicit confirmation");
    }

    #[test]
    fn remove_missing_images_deletes_only_confirmed_ids() {
        let archive_dir = tempfile::tempdir().unwrap();
        let db = Database::new(&archive_dir.path().join(".archivist/archivist.db")).unwrap();

        db.insert_image(&ghost_image("ghost")).unwrap();
        db.insert_image(&ghost_image("keep")).unwrap();

        let removed = remove_missing_images(&["ghost".to_string()], &db).unwrap();

        assert_eq!(removed, 1);
        assert!(db.get_image("ghost").unwrap().is_none());
        assert!(db.get_image("keep").unwrap().is_some());
    }

    /// A file with no parseable EXIF must leave `latitude`/`longitude` as
    /// NULL rather than panicking or writing a bogus value — the repair pass
    /// safely no-ops for images it can't extract anything from.
    #[test]
    fn repair_missing_gps_safely_no_ops_without_exif() {
        let archive_dir = tempfile::tempdir().unwrap();
        let archive_path = archive_dir.path().to_str().unwrap().to_string();
        let db = Database::new(&archive_dir.path().join(".archivist/archivist.db")).unwrap();

        let rel = "2026/01 - January/no_gps.jpg";
        let abs = archive_dir.path().join(rel);
        std::fs::create_dir_all(abs.parent().unwrap()).unwrap();
        std::fs::write(&abs, b"not a real image, no exif here").unwrap();

        let mut img = ghost_image("no_gps");
        img.file_path = rel.to_string();
        db.insert_image(&img).unwrap();

        let repaired = repair_missing_gps(&archive_path, &db).unwrap();

        assert_eq!(repaired, 0);
        let stored = db.get_image("no_gps").unwrap().unwrap();
        assert!(stored.latitude.is_none());
        assert!(stored.longitude.is_none());
    }
}
