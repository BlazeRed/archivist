use std::path::{Path, PathBuf};
use std::fs;
use image::GenericImageView;
use serde::Serialize;
use rayon::prelude::*;
use crate::error::AppError;
use crate::db::Database;
use crate::exif::{self, ExifResult};
use crate::commands::import::{destination_path, classify_media};
use crate::hasher;
use crate::thumbnail::{self, ThumbnailSize};

#[derive(Debug, Serialize)]
pub struct RescanResult {
    pub added: usize,
    pub removed: usize,
    pub repaired: usize,
    pub moved: usize,
    pub thumbnailed: usize,
    pub folders_removed: usize,
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
            Some(DiscoveredFile { original_path: path.clone(), id, exif_result, dims, duration_ms, video_creation_time, file_size, filename, media_type, codec, rotation })
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
        };

        db.insert_image(&new_image)?;
        added += 1;
    }

    // Prune: remove DB entries for files no longer on disk
    let all_paths = db.get_all_image_paths()?;
    let mut removed = 0usize;
    for (id, rel_path) in all_paths {
        let abs = Path::new(archive_path).join(&rel_path);
        if !abs.exists() {
            db.delete_image(&id)?;
            removed += 1;
        }
    }

    // Repair: re-extract EXIF for images that lack it
    let (repaired, repair_moved) = repair_missing_exif_dates(archive_path, db)?;
    moved += repair_moved;

    // Thumbnails: generate for images that lack one
    let thumbnailed = repair_missing_thumbnails(archive_path, db)?;

    // Backfill: update metadata for existing videos that have null width (imported before video_meta support)
    backfill_video_metadata(archive_path, db)?;

    let folders_removed = remove_empty_dirs(root)?;
    Ok(RescanResult { added, removed, repaired, moved, thumbnailed, folders_removed })
}

pub fn run_migrations(archive_path: &str, db: &Database) -> Result<(), AppError> {
    repair_missing_exif_dates(archive_path, db)?;
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
    match image::open(path) {
        Ok(img) => {
            let (w, h) = img.dimensions();
            Ok((Some(w), Some(h)))
        }
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
