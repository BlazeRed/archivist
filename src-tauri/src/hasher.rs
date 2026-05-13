use sha2::{Sha256, Digest};
use std::path::Path;
use std::io::Read;
use crate::error::AppError;

const BUFFER_SIZE: usize = 8192;

pub fn compute_hash(path: &Path) -> Result<String, AppError> {
    let mut file = std::fs::File::open(path).map_err(|e| AppError::FileRead {
        path: path.to_string_lossy().to_string(),
        message: e.to_string(),
    })?;

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; BUFFER_SIZE];

    loop {
        let bytes_read = file.read(&mut buffer).map_err(|e| AppError::FileRead {
            path: path.to_string_lossy().to_string(),
            message: e.to_string(),
        })?;
        
        if bytes_read == 0 {
            break;
        }
        
        hasher.update(&buffer[..bytes_read]);
    }

    let result = hasher.finalize();
    Ok(hex::encode(result))
}

pub fn verify_hash(path: &Path, expected_hash: &str) -> Result<bool, AppError> {
    let computed = compute_hash(path)?;
    Ok(computed == expected_hash)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_compute_hash_deterministic() {
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(b"test content").unwrap();
        
        let hash1 = compute_hash(file.path()).unwrap();
        let hash2 = compute_hash(file.path()).unwrap();
        
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_compute_hash_different_content() {
        let mut file1 = NamedTempFile::new().unwrap();
        file1.write_all(b"content A").unwrap();
        
        let mut file2 = NamedTempFile::new().unwrap();
        file2.write_all(b"content B").unwrap();
        
        let hash1 = compute_hash(file1.path()).unwrap();
        let hash2 = compute_hash(file2.path()).unwrap();
        
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_compute_hash_invalid_path() {
        let result = compute_hash(Path::new("/nonexistent/file.jpg"));
        assert!(result.is_err());
    }

    #[test]
    fn test_verify_hash_correct() {
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(b"test").unwrap();
        
        let hash = compute_hash(file.path()).unwrap();
        let result = verify_hash(file.path(), &hash).unwrap();
        
        assert!(result);
    }

    #[test]
    fn test_verify_hash_incorrect() {
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(b"test").unwrap();
        
        let result = verify_hash(file.path(), "incorrecthash").unwrap();
        
        assert!(!result);
    }
}