use serde::{Deserialize, Serialize};
use std::path::Path;
use chrono::{DateTime, Utc, NaiveDateTime, NaiveDate, NaiveTime, TimeZone};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExifResult {
    FromExif(DateTime<Utc>),
    FromFileMtime(DateTime<Utc>),
    Corrupted(String),
    Missing,
}

pub fn extract_date(path: &Path) -> ExifResult {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(e) => return ExifResult::Corrupted(format!("Cannot open file: {}", e)),
    };

    let mut bufreader = std::io::BufReader::new(&file);
    
    match exif::Reader::new().read_from_container(&mut bufreader) {
        Ok(exif) => {
            let date_fields = [
                exif.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY),
                exif.get_field(exif::Tag::DateTime, exif::In::PRIMARY),
                exif.get_field(exif::Tag::DateTimeDigitized, exif::In::PRIMARY),
            ];

            for field in date_fields.iter().flatten() {
                if let exif::Value::Ascii(ref ascii) = field.value {
                    for bytes in ascii.iter() {
                        if let Ok(s) = std::str::from_utf8(bytes) {
                            let s = s.trim_end_matches('\0').trim();
                            if let Ok(dt) = parse_exif_datetime(s) {
                                return ExifResult::FromExif(dt);
                            }
                        }
                    }
                }
            }
            // EXIF parsed but no date fields — fall back to mtime
            let metadata = std::fs::metadata(path).ok();
            if let Some(m) = metadata {
                if let Ok(mtime) = m.modified() {
                    let datetime: DateTime<Utc> = mtime.into();
                    return ExifResult::FromFileMtime(datetime);
                }
            }
            ExifResult::Missing
        }
        Err(_) => {
            let metadata = std::fs::metadata(path).ok();
            if let Some(m) = metadata {
                if let Ok(mtime) = m.modified() {
                    let datetime: DateTime<Utc> = mtime.into();
                    return ExifResult::FromFileMtime(datetime);
                }
            }
            ExifResult::Missing
        }
    }
}

fn parse_exif_datetime(s: &str) -> Result<DateTime<Utc>, ()> {
    let parts: Vec<&str> = s.split(' ').collect();
    if parts.len() != 2 {
        return Err(());
    }
    
    let date_parts: Vec<&str> = parts[0].split(':').collect();
    let time_parts: Vec<&str> = parts[1].split(':').collect();
    
    if date_parts.len() != 3 || time_parts.len() != 3 {
        return Err(());
    }
    
    let year: i32 = date_parts[0].parse().map_err(|_| ())?;
    let month: u32 = date_parts[1].parse().map_err(|_| ())?;
    let day: u32 = date_parts[2].parse().map_err(|_| ())?;
    let hour: u32 = time_parts[0].parse().map_err(|_| ())?;
    let minute: u32 = time_parts[1].parse().map_err(|_| ())?;
    let second: u32 = time_parts[2].parse().map_err(|_| ())?;
    
    let naive = NaiveDateTime::new(
        NaiveDate::from_ymd_opt(year, month, day).ok_or(())?,
        NaiveTime::from_hms_opt(hour, minute, second).ok_or(())?,
    );
    
    Ok(Utc.from_utc_datetime(&naive))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Datelike, Timelike};
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_extract_date_returns_mtime_fallback() {
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(b"not an image").unwrap();
        
        let result = extract_date(file.path());
        match result {
            ExifResult::FromFileMtime(_) => {},
            ExifResult::Missing => {},
            _ => panic!("Expected FromFileMtime or Missing, got {:?}", result),
        }
    }

    #[test]
    fn test_parse_exif_datetime_valid() {
        let result = parse_exif_datetime("2024:03:15 14:30:00");
        assert!(result.is_ok());
        let dt = result.unwrap();
        assert_eq!(dt.year(), 2024);
        assert_eq!(dt.month(), 3);
        assert_eq!(dt.day(), 15);
        assert_eq!(dt.hour(), 14);
        assert_eq!(dt.minute(), 30);
        assert_eq!(dt.second(), 0);
    }

    #[test]
    fn test_parse_exif_datetime_invalid() {
        assert!(parse_exif_datetime("invalid").is_err());
        assert!(parse_exif_datetime("2024-03-15 14:30:00").is_err());
        assert!(parse_exif_datetime("2024:03:15").is_err());
    }
}