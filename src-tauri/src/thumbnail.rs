use image::{DynamicImage, ImageFormat, GenericImageView};
use std::path::Path;
use crate::error::AppError;

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

pub fn get_image_dimensions(path: &Path) -> Result<(u32, u32), AppError> {
    let img = image::open(path).map_err(|e| AppError::FileRead {
        path: path.to_string_lossy().to_string(),
        message: format!("Failed to open image: {}", e),
    })?;
    
    let (width, height) = img.dimensions();
    Ok((width, height))
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
    fn test_resize_image_no_op_when_smaller() {
        let img = DynamicImage::new_rgba8(100, 100);
        let resized = resize_image(&img, 300, 300);
        
        assert_eq!(resized.width(), 100);
        assert_eq!(resized.height(), 100);
    }
}