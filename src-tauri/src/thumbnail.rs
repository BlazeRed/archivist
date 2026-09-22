use image::{DynamicImage, ImageFormat, GenericImageView};
use std::path::Path;
use crate::error::AppError;
use crate::exif::extract_orientation;

/// Rotate/flip pixels to match the EXIF Orientation tag, so downstream
/// consumers (thumbnail files, stored width/height) agree with what
/// EXIF-aware viewers (browsers, OS preview) already show.
fn apply_exif_orientation(img: DynamicImage, orientation: u16) -> DynamicImage {
    match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    }
}

pub struct ThumbnailSize {
    pub width: u32,
    pub height: u32,
}

impl ThumbnailSize {
    pub fn small() -> Self {
        Self { width: 150, height: 150 }
    }

    pub fn medium() -> Self {
        Self { width: 300, height: 300 }
    }

    pub fn large() -> Self {
        Self { width: 600, height: 600 }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "small" => Self::small(),
            "large" => Self::large(),
            _ => Self::medium(),
        }
    }
}

pub fn generate_thumbnail(
    source_path: &Path,
    dest_path: &Path,
    size: &ThumbnailSize,
) -> Result<(), AppError> {
    let img = image::open(source_path).map_err(|e| AppError::FileRead {
        path: source_path.to_string_lossy().to_string(),
        message: format!("Failed to open image: {}", e),
    })?;
    let img = apply_exif_orientation(img, extract_orientation(source_path));

    let thumbnail = resize_image(&img, size.width, size.height);

    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| AppError::FileWrite {
            path: parent.to_string_lossy().to_string(),
            message: e.to_string(),
        })?;
    }

    thumbnail.save_with_format(dest_path, ImageFormat::Jpeg).map_err(|e| AppError::FileWrite {
        path: dest_path.to_string_lossy().to_string(),
        message: format!("Failed to save thumbnail: {}", e),
    })?;

    Ok(())
}

fn resize_image(img: &DynamicImage, max_width: u32, max_height: u32) -> DynamicImage {
    let (width, height) = img.dimensions();

    if width <= max_width && height <= max_height {
        return img.clone();
    }

    let ratio = (max_width as f64) / (width as f64).min(max_height as f64 / height as f64);
    let new_width = (width as f64 * ratio).min(max_width as f64) as u32;
    let new_height = (height as f64 * ratio).min(max_height as f64) as u32;

    img.thumbnail(new_width, new_height)
}

pub fn generate_video_thumbnail(
    source_path: &Path,
    dest_path: &Path,
    size: &ThumbnailSize,
) -> Result<(), AppError> {
    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| AppError::FileWrite {
            path: parent.to_string_lossy().to_string(),
            message: e.to_string(),
        })?;
    }

    let scale_filter = format!(
        "scale='min({},iw)':'min({},ih)':force_original_aspect_ratio=decrease",
        size.width, size.height
    );
    let dest_str = dest_path.to_string_lossy();
    let src_str = source_path.to_string_lossy();

    // First attempt: seek to 1s (good for long videos)
    let result1 = std::process::Command::new(ffmpeg_sidecar::paths::ffmpeg_path())
        .args(["-y", "-ss", "1", "-i", src_str.as_ref(),
               "-vframes", "1", "-vf", scale_filter.as_str(),
               "-q:v", "3", dest_str.as_ref()])
        .output();

    if result1.map(|o| o.status.success() && dest_path.exists()).unwrap_or(false) {
        return Ok(());
    }

    // Fallback: capture at start (short videos / seek failures)
    let result2 = std::process::Command::new(ffmpeg_sidecar::paths::ffmpeg_path())
        .args(["-y", "-i", src_str.as_ref(),
               "-vframes", "1", "-vf", scale_filter.as_str(),
               "-q:v", "3", dest_str.as_ref()])
        .output();

    if result2.map(|o| o.status.success() && dest_path.exists()).unwrap_or(false) {
        Ok(())
    } else {
        Err(AppError::FileWrite {
            path: dest_str.to_string(),
            message: "ffmpeg produced no output".to_string(),
        })
    }
}

pub fn get_image_dimensions(path: &Path) -> Result<(u32, u32), AppError> {
    let img = image::open(path).map_err(|e| AppError::FileRead {
        path: path.to_string_lossy().to_string(),
        message: format!("Failed to open image: {}", e),
    })?;
    
    let (width, height) = img.dimensions();

    // Orientations 5-8 involve a 90/270 rotation, so on-disk width/height are
    // swapped relative to how the image actually displays.
    match extract_orientation(path) {
        5..=8 => Ok((height, width)),
        _ => Ok((width, height)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_thumbnail_size_presets() {
        let small = ThumbnailSize::small();
        assert_eq!(small.width, 150);
        assert_eq!(small.height, 150);

        let medium = ThumbnailSize::medium();
        assert_eq!(medium.width, 300);
        assert_eq!(medium.height, 300);

        let large = ThumbnailSize::large();
        assert_eq!(large.width, 600);
        assert_eq!(large.height, 600);
    }

    #[test]
    fn test_thumbnail_size_from_str() {
        assert_eq!(ThumbnailSize::from_str("small").width, 150);
        assert_eq!(ThumbnailSize::from_str("medium").width, 300);
        assert_eq!(ThumbnailSize::from_str("large").width, 600);
        assert_eq!(ThumbnailSize::from_str("invalid").width, 300);
    }

    #[test]
    fn test_resize_image_downscale() {
        let img = DynamicImage::new_rgba8(1000, 1000);
        let resized = resize_image(&img, 300, 300);
        
        assert!(resized.width() <= 300);
        assert!(resized.height() <= 300);
    }

    #[test]
    fn test_apply_exif_orientation_swaps_dims_on_90_270() {
        let img = DynamicImage::new_rgba8(200, 100);
        for o in [6, 8] {
            let rotated = apply_exif_orientation(img.clone(), o);
            assert_eq!((rotated.width(), rotated.height()), (100, 200), "orientation {o}");
        }
        for o in [1, 3, 2, 4] {
            let same = apply_exif_orientation(img.clone(), o);
            assert_eq!((same.width(), same.height()), (200, 100), "orientation {o}");
        }
    }

    #[test]
    fn test_resize_image_no_op_when_smaller() {
        let img = DynamicImage::new_rgba8(100, 100);
        let resized = resize_image(&img, 300, 300);
        
        assert_eq!(resized.width(), 100);
        assert_eq!(resized.height(), 100);
    }
}