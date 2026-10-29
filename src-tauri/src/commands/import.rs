use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use crate::{exif, hasher, thumbnail, error::AppError};
use crate::db::image::NewImage;

const SUPPORTED_IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "tiff", "tif", "bmp", "heic", "heif"];
const SUPPORTED_VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "mkv", "avi", "webm", "m4v", "3gp"];

pub fn classify_media(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    if SUPPORTED_IMAGE_EXTENSIONS.iter().any(|e| *e == ext.as_str()) { return Some("image"); }
    if SUPPORTED_VIDEO_EXTENSIONS.iter().any(|e| *e == ext.as_str()) { return Some("video"); }
    None
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedImage {
    pub path: String,
    pub filename: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyzedImage {
    pub path: String,
    pub filename: String,
    pub size: u64,
    pub hash: String,
    pub taken_at: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub has_exif: bool,
    pub date_source: Option<String>,
    pub conflict: Option<ConflictInfo>,
    pub media_type: String,
    pub duration_ms: Option<i64>,
    pub codec: Option<String>,
    pub rotation: Option<i32>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictInfo {
    pub existing_id: String,
    pub existing_path: String,
    pub existing_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPlan {
    pub images: Vec<AnalyzedImage>,
    pub total_size: u64,
    pub conflicts_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResolution {
    pub hash: String,
    pub action: ImportAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ImportAction {
    Skip,
    Replace,
    KeepBoth,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
    pub imported_sources: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProgressPayload {
    pub current: usize,
    pub total: usize,
    pub filename: String,
}

pub fn scan_source(source_path: &str) -> Result<Vec<ScannedImage>, AppError> {
    let path = Path::new(source_path);

    if !path.exists() {
        return Err(AppError::FileRead {
            path: source_path.to_string(),
            message: "Source path does not exist".to_string(),
        });
    }

    let mut images = Vec::new();

    if path.is_file() {
        if is_supported_media(path) {
            let metadata = std::fs::metadata(path).map_err(|e| AppError::FileRead {
                path: source_path.to_string(),
                message: e.to_string(),
            })?;
            images.push(ScannedImage {
                path: path.to_string_lossy().to_string(),
                filename: path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
                size: metadata.len(),
            });
        } else {
            return Err(AppError::FileRead {
                path: source_path.to_string(),
                message: "Unsupported file format".to_string(),
            });
        }
    } else {
        scan_directory(path, &mut images)?;
    }

    images.sort_by(|a, b| a.filename.cmp(&b.filename));
    Ok(images)
}

fn scan_directory(dir: &Path, images: &mut Vec<ScannedImage>) -> Result<(), AppError> {
    let entries = std::fs::read_dir(dir).map_err(|e| AppError::FileRead {
        path: dir.to_string_lossy().to_string(),
        message: e.to_string(),
    })?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            scan_directory(&path, images)?;
        } else if is_supported_media(&path) {
            if let Ok(metadata) = std::fs::metadata(&path) {
                images.push(ScannedImage {
                    path: path.to_string_lossy().to_string(),
                    filename: path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default(),
                    size: metadata.len(),
                });
            }
        }
    }

    Ok(())
}

fn is_supported_media(path: &Path) -> bool {
    classify_media(path).is_some()
}

pub fn analyze_image(scanned: &ScannedImage) -> Result<AnalyzedImage, AppError> {
    let path = Path::new(&scanned.path);

    let media_type = classify_media(path).unwrap_or("image").to_string();
    let hash = hasher::compute_hash(path)?;

    let exif_result = exif::extract_date(path);
    let has_exif = exif_result.has_exif();

    let (width, height, duration_ms, taken_at, date_source, codec, rotation) = if media_type == "video" {
        let vm = crate::video_meta::parse_video_meta(path);
        // Priority: filename pattern > atom/probe creation_time > mtime
        let exif_src = exif_result.date_source_label();
        let (final_taken_at, final_source) = match exif_src {
            Some("exif") | Some("filename") => (
                exif_result.datetime().map(|dt| dt.to_rfc3339()),
                exif_src.map(|s| s.to_string()),
            ),
            _ => {
                if let Some(ct) = vm.creation_time {
                    (Some(ct.to_rfc3339()), Some("atom".to_string()))
                } else {
                    (
                        exif_result.datetime().map(|dt| dt.to_rfc3339()),
                        exif_src.map(|s| s.to_string()),
                    )
                }
            }
        };
        (vm.width, vm.height, vm.duration_ms, final_taken_at, final_source, vm.codec, vm.rotation)
    } else {
        let (w, h) = match thumbnail::get_image_dimensions(path) {
            Ok((w, h)) => (Some(w), Some(h)),
            Err(_) => (None, None),
        };
        (w, h, None, exif_result.datetime().map(|dt| dt.to_rfc3339()), exif_result.date_source_label().map(|s| s.to_string()), None, None)
    };

    // GPS is photo-only for now (video GPS extraction is out of scope).
    let (latitude, longitude) = if media_type == "video" {
        (None, None)
    } else {
        match exif::extract_gps(path) {
            Some((lat, lon)) => (Some(lat), Some(lon)),
            None => (None, None),
        }
    };

    Ok(AnalyzedImage {
        path: scanned.path.clone(),
        filename: scanned.filename.clone(),
        size: scanned.size,
        hash,
        taken_at,
        width,
        height,
        has_exif,
        date_source,
        conflict: None,
        media_type,
        duration_ms,
        codec,
        rotation,
        latitude,
        longitude,
    })
}

pub fn analyze_images_batch(
    scanned: Vec<ScannedImage>,
    app: &tauri::AppHandle,
) -> Result<Vec<AnalyzedImage>, AppError> {
    use rayon::prelude::*;
    use tauri::Emitter;

    let total = scanned.len();
    let counter = AtomicUsize::new(0);
    let app = app.clone();

    let results = scanned
        .par_iter()
        .filter_map(|s| {
            let res = analyze_image(s).ok();
            let n = counter.fetch_add(1, Ordering::SeqCst) + 1;
            let _ = app.emit("analyze_progress", ProgressPayload {
                current: n,
                total,
                filename: s.filename.clone(),
            });
            res
        })
        .collect();

    Ok(results)
}

pub fn create_import_plan(images: Vec<AnalyzedImage>, db: &crate::db::Database) -> Result<ImportPlan, AppError> {
    let total_size: u64 = images.iter().map(|i| i.size).sum();

    let mut resolved = Vec::with_capacity(images.len());
    for mut img in images {
        // Replanning against another archive: drop the old archive's conflict first
        img.conflict = None;
        if db.image_exists(&img.hash)? {
            if let Some(existing) = db.get_image(&img.hash)? {
                img.conflict = Some(ConflictInfo {
                    existing_id: existing.id.clone(),
                    existing_path: existing.file_path.clone(),
                    existing_date: existing.taken_at.clone(),
                });
            }
        }
        resolved.push(img);
    }

    let conflicts_count = resolved.iter().filter(|i| i.conflict.is_some()).count();

    Ok(ImportPlan {
        images: resolved,
        total_size,
        conflicts_count,
    })
}

struct PreparedImport {
    source_path: String,
    dest_path: PathBuf,
    dest_dir: String,
    final_filename: String,
    image: AnalyzedImage,
    entry_id: String,
    thumbnail_abs: PathBuf,
    thumbnail_rel: String,
    /// Replace: absolute path of the archived duplicate, moved into place instead of copied.
    replaces: Option<PathBuf>,
}

pub fn execute_import(
    plan: ImportPlan,
    resolutions: Vec<ImportResolution>,
    archive_path: &str,
    db: &crate::db::Database,
    app: &tauri::AppHandle,
) -> Result<ImportResult, AppError> {
    use rayon::prelude::*;
    use tauri::Emitter;

    let (prepared, skipped) = prepare_imports(&plan, &resolutions, archive_path);

    // Phase 2 — parallel: copy + thumbnail + DB insert, one item at a time.
    // `import_one` is atomic per item (rolls back the copy if the DB insert
    // fails), so running the insert here instead of in a later serial phase
    // costs nothing — Database serializes writes internally via its own lock.
    let total = prepared.len();
    let counter = AtomicUsize::new(0);
    let app = app.clone();
    let archive_path_str = archive_path.to_string();

    let results: Vec<Result<(NewImage, String), String>> = prepared
        .into_par_iter()
        .map(|p| {
            let filename = p.final_filename.clone();
            let result = import_one(p, &archive_path_str, db);
            let n = counter.fetch_add(1, Ordering::SeqCst) + 1;
            let _ = app.emit("import_progress", ProgressPayload { current: n, total, filename });
            result
        })
        .collect();

    let mut imported = 0usize;
    let mut errors: Vec<String> = Vec::new();
    let mut imported_sources: Vec<String> = Vec::new();

    for r in results {
        match r {
            Ok((_, src)) => {
                imported += 1;
                imported_sources.push(src);
            }
            Err(e) => errors.push(e),
        }
    }

    Ok(ImportResult { imported, skipped, errors, imported_sources })
}

/// Phase 1 — serial: destinations and filenames for every item to import, plus the skipped count.
/// Every item gets a name free both on disk and among the names already handed out in this
/// batch, so a photo never lands on another one that merely shares its filename.
fn prepare_imports(
    plan: &ImportPlan,
    resolutions: &[ImportResolution],
    archive_path: &str,
) -> (Vec<PreparedImport>, usize) {
    let resolution_map: HashMap<&str, &ImportAction> =
        resolutions.iter().map(|r| (r.hash.as_str(), &r.action)).collect();

    let mut skipped = 0usize;
    let mut prepared: Vec<PreparedImport> = Vec::new();
    let mut reserved: HashSet<PathBuf> = HashSet::new();
    let mut seen_hashes: HashSet<&str> = HashSet::new();

    for image in &plan.images {
        let action = resolution_map.get(image.hash.as_str()).copied();
        let should_skip = match action {
            Some(a) => matches!(a, ImportAction::Skip),
            None => image.conflict.is_some(),
        };
        // Same file twice in the source: a second copy would only leave an orphan behind
        if should_skip || !seen_hashes.insert(image.hash.as_str()) {
            skipped += 1;
            continue;
        }

        let is_keep_both = matches!(action, Some(ImportAction::KeepBoth));
        let dest_dir = destination_path(archive_path, &image.taken_at);

        let replaces = match (action, &image.conflict) {
            (Some(ImportAction::Replace), Some(c)) => Some(Path::new(archive_path).join(&c.existing_path)),
            _ => None,
        };
        // The duplicate already sitting where the new one goes keeps its name (it is reused in place)
        let final_filename = if replaces.as_deref() == Some(Path::new(&dest_dir).join(&image.filename).as_path()) {
            image.filename.clone()
        } else {
            generate_unique_filename(&dest_dir, &image.filename, is_keep_both, &reserved)
        };
        let dest_path = PathBuf::from(&dest_dir).join(&final_filename);
        reserved.insert(dest_path.clone());

        let thumbnail_abs = PathBuf::from(archive_path)
            .join(".archivist/thumbnails")
            .join(format!("{}.jpg", &image.hash));
        let thumbnail_rel = format!(".archivist/thumbnails/{}.jpg", &image.hash);

        let entry_id = if is_keep_both {
            let stem = Path::new(&final_filename)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(final_filename.as_str());
            format!("{}_{}", image.hash, stem)
        } else {
            image.hash.clone()
        };

        prepared.push(PreparedImport {
            source_path: image.path.clone(),
            dest_path,
            dest_dir,
            final_filename,
            image: image.clone(),
            entry_id,
            thumbnail_abs,
            thumbnail_rel,
            replaces,
        });
    }

    (prepared, skipped)
}

/// Copies into a file that must not exist yet: a name taken since phase 1 fails the item
/// instead of being overwritten. A partial copy is removed, since it was created here.
pub(crate) fn copy_new(source: &str, dest: &Path) -> std::io::Result<()> {
    let mut from = std::fs::File::open(source)?;
    let mut to = std::fs::OpenOptions::new().write(true).create_new(true).open(dest)?;
    if let Err(e) = std::io::copy(&mut from, &mut to) {
        drop(to);
        let _ = std::fs::remove_file(dest);
        return Err(e);
    }
    Ok(())
}

/// Renames onto a path that must not exist yet (rename would silently overwrite it).
fn rename_new(from: &Path, to: &Path) -> std::io::Result<()> {
    if to.exists() {
        return Err(std::io::Error::from(std::io::ErrorKind::AlreadyExists));
    }
    std::fs::rename(from, to)
}

/// Copies one prepared item into the archive and records it in the DB.
///
/// Copy and DB-insert are made atomic here: if the insert fails (disk full,
/// DB locked), the just-copied file is deleted rather than left behind as an
/// untracked orphan. Import dedup only checks the DB by hash, so an orphan
/// would otherwise silently re-import as a "new" duplicate next time.
///
/// Replace: the archived duplicate holds the same bytes (checked by hash), so it is
/// moved into place, even out of the Trash, instead of copying a second file next to
/// it. Nothing is deleted. If it changed or is gone, the source is copied as usual.
fn import_one(
    p: PreparedImport,
    archive_path: &str,
    db: &crate::db::Database,
) -> Result<(NewImage, String), String> {
    std::fs::create_dir_all(&p.dest_dir)
        .map_err(|e| format!("Failed to create directory {}: {}", p.dest_dir, e))?;

    let reused = p.replaces.as_ref()
        .filter(|old| hasher::compute_hash(old).is_ok_and(|h| h == p.image.hash));
    let placed = match reused {
        Some(old) if *old == p.dest_path => Ok(()),
        Some(old) => rename_new(old, &p.dest_path),
        None => copy_new(&p.source_path, &p.dest_path),
    };
    placed.map_err(|e| format!("Failed to copy {}: {}", p.image.filename, e))?;

    // Preserve original mtime so rescan yields the same date if DB is rebuilt
    if let Ok(src_meta) = std::fs::metadata(&p.source_path) {
        if let Ok(mtime) = src_meta.modified() {
            if let Ok(f) = std::fs::OpenOptions::new().write(true).open(&p.dest_path) {
                let _ = f.set_times(std::fs::FileTimes::new().set_modified(mtime));
            }
        }
    }

    let stored_thumbnail = if p.thumbnail_abs.exists() {
        Some(p.thumbnail_rel.clone())
    } else if p.image.media_type == "video" {
        crate::thumbnail::generate_video_thumbnail(&p.dest_path, &p.thumbnail_abs, &crate::thumbnail::ThumbnailSize::medium())
            .ok()
            .map(|_| p.thumbnail_rel.clone())
    } else {
        crate::thumbnail::generate_thumbnail(&p.dest_path, &p.thumbnail_abs, &crate::thumbnail::ThumbnailSize::medium())
            .ok()
            .map(|_| p.thumbnail_rel.clone())
    };

    let relative_path = format!(
        "{}/{}",
        Path::new(&p.dest_dir)
            .strip_prefix(archive_path)
            .map(|x| x.to_string_lossy().to_string())
            .unwrap_or_else(|_| p.dest_dir.clone()),
        &p.final_filename
    );

    let web_path = if p.image.media_type == "video" {
        let compat = crate::video_meta::is_web_compatible(&p.image.codec, &p.dest_path);
        if compat { Some(relative_path.clone()) } else { None }
    } else {
        None
    };

    let new_image = NewImage {
        id: p.entry_id,
        filename: p.final_filename.clone(),
        file_path: relative_path,
        taken_at: p.image.taken_at.clone(),
        width: p.image.width.map(|w| w as i32),
        height: p.image.height.map(|h| h as i32),
        file_size: Some(p.image.size as i64),
        has_exif: p.image.has_exif,
        date_source: p.image.date_source.clone(),
        thumbnail_path: stored_thumbnail,
        media_type: p.image.media_type.clone(),
        duration_ms: p.image.duration_ms,
        codec: p.image.codec.clone(),
        rotation: p.image.rotation,
        web_path,
        latitude: p.image.latitude,
        longitude: p.image.longitude,
    };

    if let Err(e) = db.insert_image(&new_image) {
        match reused {
            Some(old) if *old != p.dest_path => { let _ = std::fs::rename(&p.dest_path, old); }
            Some(_) => {}
            None => { let _ = std::fs::remove_file(&p.dest_path); }
        }
        return Err(format!("DB insert error for {}: {}", new_image.filename, e));
    }

    Ok((new_image, p.source_path))
}

pub(crate) fn destination_path(archive_root: &str, taken_at: &Option<String>) -> String {
    if let Some(ref dt) = taken_at {
        if let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(dt) {
            let year = parsed.format("%Y").to_string();
            let month: u32 = parsed.format("%m").to_string().parse().unwrap_or(1);
            return format!("{}/{}/{}", archive_root, year, month_label(month));
        }
    }
    format!("{}/No Date", archive_root)
}

const MONTHS: &[&str] = &[
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

fn month_label(month: u32) -> String {
    let month_name = MONTHS.get((month - 1) as usize).unwrap_or(&"Unknown");
    format!("{:02} - {}", month, month_name)
}

pub fn generate_temp_thumbnail(source_path: &str) -> Result<String, AppError> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut h = DefaultHasher::new();
    source_path.hash(&mut h);
    let key = h.finish();

    let tmp_dir = std::env::temp_dir().join("archivist-previews");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| AppError::FileWrite {
        path: tmp_dir.to_string_lossy().to_string(),
        message: e.to_string(),
    })?;

    let thumb_path = tmp_dir.join(format!("{}.jpg", key));

    if !thumb_path.exists() {
        crate::thumbnail::generate_thumbnail(
            Path::new(source_path),
            &thumb_path,
            &crate::thumbnail::ThumbnailSize::small(),
        )?;
    }

    Ok(thumb_path.to_string_lossy().to_string())
}

pub fn generate_temp_thumbnails_batch(
    source_paths: Vec<String>,
    app: &tauri::AppHandle,
) -> Result<std::collections::HashMap<String, String>, AppError> {
    use rayon::prelude::*;
    use tauri::Emitter;

    #[derive(Serialize, Clone)]
    struct ThumbProgressPayload { current: usize, total: usize }

    let total = source_paths.len();
    let counter = AtomicUsize::new(0);

    let pairs: Vec<(String, String)> = source_paths
        .par_iter()
        .filter_map(|path| {
            let result = generate_temp_thumbnail(path).ok()?;
            let n = counter.fetch_add(1, Ordering::SeqCst) + 1;
            let _ = app.emit("thumb_progress", ThumbProgressPayload { current: n, total });
            Some((path.clone(), result))
        })
        .collect();

    Ok(pairs.into_iter().collect())
}

pub fn pre_generate_all_thumbnails_batch(
    analyzed: &[AnalyzedImage],
    archive_path: &str,
    app: &tauri::AppHandle,
) -> Result<(), AppError> {
    use rayon::prelude::*;
    use tauri::Emitter;

    #[derive(Serialize, Clone)]
    struct ThumbProgressPayload { current: usize, total: usize }

    let thumb_dir = std::path::PathBuf::from(archive_path)
        .join(".archivist")
        .join("thumbnails");
    std::fs::create_dir_all(&thumb_dir).map_err(|e| AppError::FileWrite {
        path: thumb_dir.to_string_lossy().to_string(),
        message: e.to_string(),
    })?;

    let total = analyzed.len();
    let counter = AtomicUsize::new(0);

    analyzed.par_iter().for_each(|img| {
        if img.media_type != "video" {
            let dest = thumb_dir.join(format!("{}.jpg", img.hash));
            if !dest.exists() {
                let _ = thumbnail::generate_thumbnail(
                    Path::new(&img.path),
                    &dest,
                    &thumbnail::ThumbnailSize::medium(),
                );
            }
        }
        let n = counter.fetch_add(1, Ordering::SeqCst) + 1;
        let _ = app.emit("thumb_progress", ThumbProgressPayload { current: n, total });
    });

    Ok(())
}

pub fn cleanup_unimported_thumbnails(
    hashes: Vec<String>,
    archive_path: &str,
    db: &crate::db::Database,
) -> Result<(), AppError> {
    let thumb_dir = std::path::PathBuf::from(archive_path)
        .join(".archivist")
        .join("thumbnails");

    for hash in &hashes {
        let path = thumb_dir.join(format!("{}.jpg", hash));
        if path.exists() {
            if let Ok(false) = db.image_exists(hash) {
                let _ = std::fs::remove_file(&path);
            }
        }
    }
    Ok(())
}

pub fn cleanup_temp_thumbnails() -> Result<(), AppError> {
    let tmp_dir = std::env::temp_dir().join("archivist-previews");
    if tmp_dir.exists() {
        std::fs::remove_dir_all(&tmp_dir).map_err(|e| AppError::FileWrite {
            path: tmp_dir.to_string_lossy().to_string(),
            message: e.to_string(),
        })?;
    }
    Ok(())
}

/// `original` if free (unless `force_suffix`), else `stem_N.ext` with the first free N.
/// Free = not on disk and not in `reserved` (names handed out earlier in the same batch).
pub fn generate_unique_filename(dir: &str, original: &str, force_suffix: bool, reserved: &HashSet<PathBuf>) -> String {
    let path = Path::new(dir);
    let is_taken = |name: &str| {
        let candidate = path.join(name);
        candidate.exists() || reserved.contains(&candidate)
    };
    if !force_suffix && !is_taken(original) {
        return original.to_string();
    }

    let stem = Path::new(original)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");
    let ext = Path::new(original)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg");

    let mut counter = 1;
    let mut filename = format!("{}_{}.{}", stem, counter, ext);

    while is_taken(&filename) {
        counter += 1;
        filename = format!("{}_{}.{}", stem, counter, ext);
    }

    filename
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn sample_analyzed(hash: &str) -> AnalyzedImage {
        AnalyzedImage {
            path: String::new(),
            filename: format!("{hash}.jpg"),
            size: 3,
            hash: hash.to_string(),
            taken_at: None,
            width: None,
            height: None,
            has_exif: false,
            date_source: None,
            conflict: None,
            media_type: "image".to_string(),
            duration_ms: None,
            codec: None,
            rotation: None,
            latitude: None,
            longitude: None,
        }
    }

    /// Regression test for the orphan-file bug: if the DB insert fails after
    /// the file has already been copied into the archive, the copy must be
    /// rolled back — otherwise it becomes an untracked duplicate that dedup
    /// (DB-hash-based) can never see again.
    #[test]
    fn import_one_rolls_back_copy_on_db_failure() {
        let src_dir = tempfile::tempdir().unwrap();
        let archive_dir = tempfile::tempdir().unwrap();
        let archive_path = archive_dir.path().to_str().unwrap().to_string();

        let source_path = src_dir.path().join("photo.jpg");
        std::fs::write(&source_path, b"fake image bytes").unwrap();

        let db = Database::new(&archive_dir.path().join(".archivist/archivist.db")).unwrap();
        // Force every insert to fail, simulating a disk-full or locked-DB condition.
        db.connection().execute("DROP TABLE images", []).unwrap();

        let dest_dir = format!("{archive_path}/No Date");
        let dest_path = PathBuf::from(&dest_dir).join("photo.jpg");

        let prepared = PreparedImport {
            source_path: source_path.to_string_lossy().to_string(),
            dest_path: dest_path.clone(),
            dest_dir,
            final_filename: "photo.jpg".to_string(),
            image: sample_analyzed("abc123"),
            entry_id: "abc123".to_string(),
            thumbnail_abs: archive_dir.path().join(".archivist/thumbnails/abc123.jpg"),
            thumbnail_rel: ".archivist/thumbnails/abc123.jpg".to_string(),
            replaces: None,
        };

        let result = import_one(prepared, &archive_path, &db);

        assert!(result.is_err());
        assert!(!dest_path.exists(), "copied file must be rolled back when the DB insert fails");
        assert!(source_path.exists(), "original source file must never be touched");
    }

    /// Regression test for the same-name overwrite bug: a new photo whose filename is
    /// already taken in its month folder (by the archive or by another item of the same
    /// import) must get a free name, never replace the other photo's bytes.
    #[test]
    fn same_filename_never_overwrites_another_photo() {
        let src_dir = tempfile::tempdir().unwrap();
        let archive_dir = tempfile::tempdir().unwrap();
        let archive_path = archive_dir.path().to_str().unwrap().to_string();
        let db = Database::new(&archive_dir.path().join(".archivist/archivist.db")).unwrap();

        let existing = archive_dir.path().join("No Date/photo.jpg");
        std::fs::create_dir_all(existing.parent().unwrap()).unwrap();
        std::fs::write(&existing, b"already archived").unwrap();

        let source = |sub: &str, bytes: &[u8], hash: &str| {
            let path = src_dir.path().join(sub).join("photo.jpg");
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, bytes).unwrap();
            AnalyzedImage {
                path: path.to_string_lossy().to_string(),
                filename: "photo.jpg".to_string(),
                ..sample_analyzed(hash)
            }
        };
        let plan = ImportPlan {
            images: vec![
                source("a", b"camera A", "hashA"),
                source("b", b"camera B", "hashB"),
                source("c", b"camera A", "hashA"), // same file twice in the source
            ],
            total_size: 0,
            conflicts_count: 0,
        };

        let (prepared, skipped) = prepare_imports(&plan, &[], &archive_path);
        assert_eq!((prepared.len(), skipped), (2, 1));
        for p in prepared {
            import_one(p, &archive_path, &db).unwrap();
        }

        let read = |name: &str| std::fs::read(archive_dir.path().join("No Date").join(name)).unwrap();
        assert_eq!(read("photo.jpg"), b"already archived");
        assert_eq!(read("photo_1.jpg"), b"camera A");
        assert_eq!(read("photo_2.jpg"), b"camera B");

        // A name taken after planning fails the copy instead of overwriting
        assert!(copy_new(&plan.images[0].path, &existing).is_err());
        assert_eq!(read("photo.jpg"), b"already archived");
    }

    /// Regression test for Replace wiping groups/favourite (`INSERT OR REPLACE` + FK cascade)
    /// and orphaning the duplicate: Replace on a trashed duplicate must move that same file
    /// to the new date folder and keep the row's groups and favourite.
    #[test]
    fn replace_keeps_groups_favourite_and_reuses_the_duplicate() {
        let src_dir = tempfile::tempdir().unwrap();
        let archive_dir = tempfile::tempdir().unwrap();
        let archive_path = archive_dir.path().to_str().unwrap().to_string();
        let db = Database::new(&archive_dir.path().join(".archivist/archivist.db")).unwrap();

        let trashed = archive_dir.path().join("Trash/photo.jpg");
        std::fs::create_dir_all(trashed.parent().unwrap()).unwrap();
        std::fs::write(&trashed, b"same bytes").unwrap();
        let hash = hasher::compute_hash(&trashed).unwrap();
        db.insert_image(&NewImage {
            id: hash.clone(),
            filename: "photo.jpg".into(),
            file_path: "Trash/photo.jpg".into(),
            taken_at: None,
            width: None, height: None, file_size: None, has_exif: false,
            date_source: None, thumbnail_path: None, media_type: "image".into(),
            duration_ms: None, codec: None, rotation: None, web_path: None,
            latitude: None, longitude: None,
        }).unwrap();
        db.set_image_location(&hash, "Trash/photo.jpg", "photo.jpg", Some("2026-01-01T00:00:00+00:00")).unwrap();
        let group = db.create_group("Trip").unwrap();
        db.add_image_to_group(&hash, group).unwrap();
        db.set_image_favourite(&hash, true).unwrap();

        let source = src_dir.path().join("photo.jpg");
        std::fs::write(&source, b"same bytes").unwrap();
        let plan = ImportPlan {
            images: vec![AnalyzedImage {
                path: source.to_string_lossy().to_string(),
                filename: "photo.jpg".to_string(),
                taken_at: Some("2024-03-10T12:00:00+00:00".to_string()),
                conflict: Some(ConflictInfo {
                    existing_id: hash.clone(),
                    existing_path: "Trash/photo.jpg".to_string(),
                    existing_date: None,
                }),
                ..sample_analyzed(&hash)
            }],
            total_size: 0,
            conflicts_count: 1,
        };
        let replace = [ImportResolution { hash: hash.clone(), action: ImportAction::Replace }];

        let (prepared, _) = prepare_imports(&plan, &replace, &archive_path);
        for p in prepared {
            import_one(p, &archive_path, &db).unwrap();
        }

        assert!(!trashed.exists(), "the duplicate is moved, not left behind as an orphan");
        assert!(archive_dir.path().join("2024/03 - March/photo.jpg").exists());
        assert!(source.exists(), "source is never touched");
        let img = db.get_image(&hash).unwrap().unwrap();
        assert_eq!(img.file_path, "2024/03 - March/photo.jpg");
        assert!(img.trashed_at.is_none());
        assert!(img.is_favourite);
        assert_eq!(db.get_images_in_group(group).unwrap(), vec![hash]);
    }
}
