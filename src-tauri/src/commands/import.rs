use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use crate::{exif, hasher, thumbnail, error::AppError};
use crate::db::image::NewImage;

const SUPPORTED_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "tiff", "tif", "bmp", "heic", "heif"];

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSingleResult {
    pub status: String,
    pub error: Option<String>,
    pub source_path: Option<String>,
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
        if is_supported_image(path) {
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
                message: "Unsupported image format".to_string(),
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
        } else if is_supported_image(&path) {
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

fn is_supported_image(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| SUPPORTED_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn analyze_image(scanned: &ScannedImage) -> Result<AnalyzedImage, AppError> {
    let path = Path::new(&scanned.path);

    let hash = hasher::compute_hash(path)?;

    let (width, height) = match thumbnail::get_image_dimensions(path) {
        Ok((w, h)) => (Some(w), Some(h)),
        Err(_) => (None, None),
    };

    let exif_result = exif::extract_date(path);
    let has_exif = exif_result.has_exif();
    let date_source = exif_result.date_source_label().map(|s| s.to_string());
    let taken_at = exif_result.datetime().map(|dt| dt.to_rfc3339());

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

    let resolution_map: std::collections::HashMap<String, &ImportResolution> =
        resolutions.iter().map(|r| (r.hash.clone(), r)).collect();

    // Phase 1 — serial: compute destinations and unique filenames (filesystem-order matters)
    let mut skipped = 0usize;
    let mut prepared: Vec<PreparedImport> = Vec::new();

    for image in &plan.images {
        let resolution = resolution_map.get(&image.hash);

        let should_skip = match resolution {
            Some(r) => matches!(r.action, ImportAction::Skip),
            None => image.conflict.is_some(),
        };
        if should_skip {
            skipped += 1;
            continue;
        }

        let dest_dir = destination_path(archive_path, &image.taken_at);

        let final_filename = if let Some(res) = resolution {
            match res.action {
                ImportAction::KeepBoth => generate_unique_filename(&dest_dir, &image.filename),
                ImportAction::Replace => image.filename.clone(),
                ImportAction::Skip => {
                    skipped += 1;
                    continue;
                }
            }
        } else {
            image.filename.clone()
        };

        let is_keep_both = resolution.map_or(false, |r| matches!(r.action, ImportAction::KeepBoth));
        let dest_path = PathBuf::from(&dest_dir).join(&final_filename);

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
        });
    }

    // Phase 2 — parallel: file copy + thumbnail generation
    let total = prepared.len();
    let counter = AtomicUsize::new(0);
    let app = app.clone();
    let archive_path_str = archive_path.to_string();

    let results: Vec<Result<(NewImage, String), String>> = prepared
        .into_par_iter()
        .map(|p| {
            if let Err(e) = std::fs::create_dir_all(&p.dest_dir) {
                return Err(format!("Failed to create directory {}: {}", p.dest_dir, e));
            }

            match std::fs::copy(&p.source_path, &p.dest_path) {
                Ok(_) => {
                    let stored_thumbnail = if p.thumbnail_abs.exists() {
                        Some(p.thumbnail_rel.clone())
                    } else {
                        match crate::thumbnail::generate_thumbnail(
                            &p.dest_path,
                            &p.thumbnail_abs,
                            &crate::thumbnail::ThumbnailSize::medium(),
                        ) {
                            Ok(_) => Some(p.thumbnail_rel),
                            Err(_) => None,
                        }
                    };

                    let relative_path = format!(
                        "{}/{}",
                        Path::new(&p.dest_dir)
                            .strip_prefix(&archive_path_str)
                            .map(|x| x.to_string_lossy().to_string())
                            .unwrap_or_else(|_| p.dest_dir.clone()),
                        &p.final_filename
                    );

                    let new_image = NewImage {
                        id: p.entry_id,
                        filename: p.final_filename.clone(),
                        file_path: relative_path,
                        taken_at: p.image.taken_at,
                        width: p.image.width.map(|w| w as i32),
                        height: p.image.height.map(|h| h as i32),
                        file_size: Some(p.image.size as i64),
                        has_exif: p.image.has_exif,
                        date_source: p.image.date_source,
                        thumbnail_path: stored_thumbnail,
                    };

                    let n = counter.fetch_add(1, Ordering::SeqCst) + 1;
                    let _ = app.emit("import_progress", ProgressPayload {
                        current: n,
                        total,
                        filename: p.final_filename.clone(),
                    });

                    Ok((new_image, p.source_path))
                }
                Err(e) => Err(format!("Failed to copy {}: {}", p.image.filename, e)),
            }
        })
        .collect();

    // Phase 3 — serial: DB inserts
    let mut imported = 0usize;
    let mut errors: Vec<String> = Vec::new();
    let mut imported_sources: Vec<String> = Vec::new();

    for r in results {
        match r {
            Ok((new_image, src)) => {
                if let Err(e) = db.insert_image(&new_image) {
                    errors.push(format!("DB insert error: {}", e));
                } else {
                    imported += 1;
                    imported_sources.push(src);
                }
            }
            Err(e) => errors.push(e),
        }
    }

    Ok(ImportResult { imported, skipped, errors, imported_sources })
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

pub fn import_single_image(
    image: AnalyzedImage,
    resolution: Option<ImportResolution>,
    archive_path: &str,
    db: &crate::db::Database,
) -> Result<ImportSingleResult, AppError> {
    let source_path = image.path.clone();

    let should_skip = match &resolution {
        Some(r) => matches!(r.action, ImportAction::Skip),
        None => image.conflict.is_some(),
    };

    if should_skip {
        return Ok(ImportSingleResult { status: "skipped".to_string(), error: None, source_path: None });
    }

    let dest_dir = destination_path(archive_path, &image.taken_at);

    let final_filename = match &resolution {
        Some(res) => match res.action {
            ImportAction::KeepBoth => generate_unique_filename(&dest_dir, &image.filename),
            ImportAction::Replace => image.filename.clone(),
            ImportAction::Skip => return Ok(ImportSingleResult { status: "skipped".to_string(), error: None, source_path: None }),
        },
        None => image.filename.clone(),
    };

    let is_keep_both = resolution.as_ref().map_or(false, |r| matches!(r.action, ImportAction::KeepBoth));
    let dest_path = PathBuf::from(&dest_dir).join(&final_filename);

    if let Err(e) = std::fs::create_dir_all(&dest_dir) {
        return Ok(ImportSingleResult {
            status: "error".to_string(),
            error: Some(format!("Failed to create directory {}: {}", dest_dir, e)),
            source_path: None,
        });
    }

    match std::fs::copy(&image.path, &dest_path) {
        Ok(_) => {
            let thumbnail_abs = PathBuf::from(archive_path)
                .join(".archivist/thumbnails")
                .join(format!("{}.jpg", &image.hash));
            let thumbnail_rel = format!(".archivist/thumbnails/{}.jpg", &image.hash);
            let stored_thumbnail = if thumbnail_abs.exists() {
                Some(thumbnail_rel.clone())
            } else {
                match crate::thumbnail::generate_thumbnail(
                    &dest_path,
                    &thumbnail_abs,
                    &crate::thumbnail::ThumbnailSize::medium(),
                ) {
                    Ok(_) => Some(thumbnail_rel),
                    Err(_) => None,
                }
            };

            let relative_path = format!("{}/{}",
                Path::new(&dest_dir).strip_prefix(archive_path)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| dest_dir.clone()),
                &final_filename
            );

            let entry_id = if is_keep_both {
                let stem = Path::new(&final_filename)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or(final_filename.as_str());
                format!("{}_{}", image.hash, stem)
            } else {
                image.hash.clone()
            };

            let new_image = NewImage {
                id: entry_id,
                filename: final_filename,
                file_path: relative_path,
                taken_at: image.taken_at,
                width: image.width.map(|w| w as i32),
                height: image.height.map(|h| h as i32),
                file_size: Some(image.size as i64),
                has_exif: image.has_exif,
                date_source: image.date_source,
                thumbnail_path: stored_thumbnail,
            };

            match db.insert_image(&new_image) {
                Ok(_) => Ok(ImportSingleResult {
                    status: "imported".to_string(),
                    error: None,
                    source_path: Some(source_path),
                }),
                Err(e) => Ok(ImportSingleResult {
                    status: "error".to_string(),
                    error: Some(format!("Failed to insert into database: {}", e)),
                    source_path: None,
                }),
            }
        },
        Err(e) => Ok(ImportSingleResult {
            status: "error".to_string(),
            error: Some(format!("Failed to copy {}: {}", image.filename, e)),
            source_path: None,
        }),
    }
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
        let dest = thumb_dir.join(format!("{}.jpg", img.hash));
        if !dest.exists() {
            let _ = thumbnail::generate_thumbnail(
                Path::new(&img.path),
                &dest,
                &thumbnail::ThumbnailSize::medium(),
            );
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

pub fn generate_unique_filename(dir: &str, original: &str) -> String {
    let path = Path::new(dir);
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

    while path.join(&filename).exists() {
        counter += 1;
        filename = format!("{}_{}.{}", stem, counter, ext);
    }

    filename
}
