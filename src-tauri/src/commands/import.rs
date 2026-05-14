use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use crate::{exif, hasher, thumbnail, error::AppError};
use crate::db::image::NewImage;

const SUPPORTED_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "tiff", "tif", "bmp", "heic", "heif"];
const _BLOCK_SIZE: usize = 50;

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
pub struct ProgressEvent {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
    pub phase: String,
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
    
    scan_directory(path, &mut images)?;
    
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
    let (taken_at, has_exif) = match exif_result {
        exif::ExifResult::FromExif(dt) => (Some(dt.to_rfc3339()), true),
        exif::ExifResult::FromFileMtime(dt) => (Some(dt.to_rfc3339()), false),
        exif::ExifResult::Corrupted(_) => (None, false),
        exif::ExifResult::Missing => (None, false),
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
        conflict: None,
    })
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

pub fn execute_import(
    plan: ImportPlan,
    resolutions: Vec<ImportResolution>,
    archive_path: &str,
    db: &crate::db::Database,
) -> Result<ImportResult, AppError> {
    let mut imported = 0;
    let mut skipped = 0;
    let mut errors = Vec::new();
    let mut imported_sources: Vec<String> = Vec::new();
    
    let resolution_map: std::collections::HashMap<String, &ImportResolution> = 
        resolutions.iter().map(|r| (r.hash.clone(), r)).collect();
    
    for image in plan.images {
        let source_path = image.path.clone();
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
        
        let dest_path = PathBuf::from(&dest_dir).join(&final_filename);
        
        match std::fs::create_dir_all(&dest_dir) {
            Ok(_) => {},
            Err(e) => {
                errors.push(format!("Failed to create directory {}: {}", dest_dir, e));
                continue;
            }
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

                let new_image = NewImage {
                    id: image.hash.clone(),
                    filename: final_filename,
                    file_path: relative_path,
                    taken_at: image.taken_at,
                    width: image.width.map(|w| w as i32),
                    height: image.height.map(|h| h as i32),
                    file_size: Some(image.size as i64),
                    has_exif: image.has_exif,
                    thumbnail_path: stored_thumbnail,
                };
                
                if let Err(e) = db.insert_image(&new_image) {
                    errors.push(format!("Failed to insert into database: {}", e));
                } else {
                    imported += 1;
                    imported_sources.push(source_path);
                }
            },
            Err(e) => {
                errors.push(format!("Failed to copy {}: {}", image.filename, e));
            }
        }
    }
    
    Ok(ImportResult {
        imported,
        skipped,
        errors,
        imported_sources,
    })
}

fn destination_path(archive_root: &str, taken_at: &Option<String>) -> String {
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

fn generate_unique_filename(dir: &str, original: &str) -> String {
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