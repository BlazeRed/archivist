use serde::{Deserialize, Serialize};
use std::path::Path;
use chrono::{DateTime, Utc, TimeZone};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExifResult {
    FromExif(DateTime<Utc>),
    FromFilename(DateTime<Utc>),
    FromCreatedTime(DateTime<Utc>),
    FromFileMtime(DateTime<Utc>),
    Corrupted(String),
    Missing,
}

impl ExifResult {
    pub fn has_exif(&self) -> bool {
        matches!(self, ExifResult::FromExif(_))
    }

    pub fn date_source_label(&self) -> Option<&'static str> {
        match self {
            ExifResult::FromExif(_)        => Some("exif"),
            ExifResult::FromFilename(_)    => Some("filename"),
            ExifResult::FromCreatedTime(_) => Some("created"),
            ExifResult::FromFileMtime(_)   => Some("mtime"),
            ExifResult::Corrupted(_) | ExifResult::Missing => None,
        }
    }

    pub fn datetime(&self) -> Option<DateTime<Utc>> {
        match self {
            ExifResult::FromExif(dt)
            | ExifResult::FromFilename(dt)
            | ExifResult::FromCreatedTime(dt)
            | ExifResult::FromFileMtime(dt) => Some(*dt),
            _ => None,
        }
    }
}

pub fn extract_date(path: &Path) -> ExifResult {
    if let Ok(exif) = nom_exif::read_exif(path) {
        let tags = [
            nom_exif::ExifTag::DateTimeOriginal,
            nom_exif::ExifTag::CreateDate,
            nom_exif::ExifTag::ModifyDate,
        ];
        for tag in tags {
            if let Some(val) = exif.get(tag) {
                if let Some(exif_dt) = val.as_datetime() {
                    let dt = Utc.from_utc_datetime(&exif_dt.into_naive());
                    return ExifResult::FromExif(dt);
                }
            }
        }
    }

    if let Some(dt) = try_png_ttext_exif(path) {
        return ExifResult::FromExif(dt);
    }

    if let Some(dt) = try_xmp_date(path) {
        return ExifResult::FromExif(dt);
    }

    if let Some(dt) = try_filename_date(path) {
        return ExifResult::FromFilename(dt);
    }

    if let Some(dt) = try_created_time(path) {
        return ExifResult::FromCreatedTime(dt);
    }

    mtime_fallback(path)
}

fn try_filename_date(path: &Path) -> Option<DateTime<Utc>> {
    use regex::Regex;
    use chrono::NaiveDate;
    use std::sync::OnceLock;

    // YYYYMMDD followed by 1-char separator and HHMMSS (phone cameras, Pixel, etc.)
    static COMPACT_DT: OnceLock<Regex> = OnceLock::new();
    let compact_re = COMPACT_DT.get_or_init(|| {
        Regex::new(r"((?:19|20)\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[_\-T ]([01]\d|2[0-3])([0-5]\d)([0-5]\d)?").unwrap()
    });

    // YYYY-MM-DD followed by non-digit separator then HH:MM:SS (Screenshot_2023-10-05-14-30-20, WhatsApp, etc.)
    static SEP_DT: OnceLock<Regex> = OnceLock::new();
    let sep_dt_re = SEP_DT.get_or_init(|| {
        Regex::new(r"((?:19|20)\d{2})[-_.](0[1-9]|1[0-2])[-_.](0[1-9]|[12]\d|3[01])[^0-9]{1,6}([01]\d|2[0-3])[-_:.]([0-5]\d)(?:[-_:.]([0-5]\d))?").unwrap()
    });

    // YYYY-MM-DD date only
    static SEP_DATE: OnceLock<Regex> = OnceLock::new();
    let sep_date_re = SEP_DATE.get_or_init(|| {
        Regex::new(r"((?:19|20)\d{2})[-_.](0[1-9]|1[0-2])[-_.](0[1-9]|[12]\d|3[01])").unwrap()
    });

    let name = path.file_name()?.to_str()?;

    if let Some(caps) = compact_re.captures(name) {
        let y: i32 = caps[1].parse().ok()?;
        let mo: u32 = caps[2].parse().ok()?;
        let d: u32 = caps[3].parse().ok()?;
        let h: u32 = caps[4].parse().ok()?;
        let mi: u32 = caps[5].parse().ok()?;
        let s: u32 = caps.get(6).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
        let nd = NaiveDate::from_ymd_opt(y, mo, d)?.and_hms_opt(h, mi, s)?;
        return Some(Utc.from_utc_datetime(&nd));
    }

    if let Some(caps) = sep_dt_re.captures(name) {
        let y: i32 = caps[1].parse().ok()?;
        let mo: u32 = caps[2].parse().ok()?;
        let d: u32 = caps[3].parse().ok()?;
        let h: u32 = caps[4].parse().ok()?;
        let mi: u32 = caps[5].parse().ok()?;
        let s: u32 = caps.get(6).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
        let nd = NaiveDate::from_ymd_opt(y, mo, d)?.and_hms_opt(h, mi, s)?;
        return Some(Utc.from_utc_datetime(&nd));
    }

    if let Some(caps) = sep_date_re.captures(name) {
        let y: i32 = caps[1].parse().ok()?;
        let mo: u32 = caps[2].parse().ok()?;
        let d: u32 = caps[3].parse().ok()?;
        let nd = NaiveDate::from_ymd_opt(y, mo, d)?.and_hms_opt(0, 0, 0)?;
        return Some(Utc.from_utc_datetime(&nd));
    }

    None
}

fn try_created_time(path: &Path) -> Option<DateTime<Utc>> {
    let meta = std::fs::metadata(path).ok()?;
    let created = meta.created().ok()?;
    Some(created.into())
}

fn try_png_ttext_exif(path: &Path) -> Option<DateTime<Utc>> {
    use std::io::Read;
    let ext = path.extension()?.to_str()?.to_lowercase();
    if ext != "png" { return None; }

    let mut f = std::fs::File::open(path).ok()?;
    let mut buf = vec![0u8; 512 * 1024];
    let n = f.read(&mut buf).ok()?;
    let data = &buf[..n];

    if data.len() < 8 || &data[..8] != b"\x89PNG\r\n\x1a\n" { return None; }

    let mut pos = 8usize;
    while pos + 12 <= data.len() {
        let length = u32::from_be_bytes([data[pos], data[pos+1], data[pos+2], data[pos+3]]) as usize;
        let ctype = &data[pos+4..pos+8];
        match ctype {
            b"IDAT" | b"IEND" => break,
            b"tEXt" => {
                if pos + 8 + length <= data.len() {
                    if let Some(dt) = try_parse_png_exif_chunk(&data[pos+8..pos+8+length]) {
                        return Some(dt);
                    }
                }
            }
            _ => {}
        }
        pos += 8 + length + 4;
    }
    None
}

fn try_parse_png_exif_chunk(chunk: &[u8]) -> Option<DateTime<Utc>> {
    let nul = chunk.iter().position(|&b| b == 0)?;
    let key = &chunk[..nul];
    if key != b"Raw profile type exif" && key != b"Raw profile type APP1" { return None; }
    let value = std::str::from_utf8(&chunk[nul+1..]).ok()?;

    let mut lines = value.lines();
    lines.next()?; lines.next()?; lines.next()?;
    let hex: String = lines.collect::<Vec<_>>().join("");
    let cleaned: String = hex.chars().filter(|c| !c.is_whitespace()).collect();
    if cleaned.len() % 2 != 0 { return None; }
    let mut tiff: Vec<u8> = (0..cleaned.len()).step_by(2)
        .filter_map(|i| u8::from_str_radix(&cleaned[i..i+2], 16).ok())
        .collect();
    if cleaned.len() / 2 != tiff.len() { return None; }

    if tiff.starts_with(b"Exif\0\0") { tiff.drain(0..6); }

    #[allow(deprecated)]
    let exif = nom_exif::read_exif_from_bytes(tiff).ok()?;
    for tag in [nom_exif::ExifTag::DateTimeOriginal, nom_exif::ExifTag::CreateDate, nom_exif::ExifTag::ModifyDate] {
        if let Some(val) = exif.get(tag) {
            if let Some(dt) = val.as_datetime() {
                return Some(Utc.from_utc_datetime(&dt.into_naive()));
            }
        }
    }
    None
}

fn try_xmp_date(path: &Path) -> Option<DateTime<Utc>> {
    use std::io::Read;
    let mut f = std::fs::File::open(path).ok()?;
    let mut buf = vec![0u8; 4 * 1024 * 1024];
    let n = f.read(&mut buf).ok()?;
    let data = &buf[..n];

    let start = find_bytes(data, b"<x:xmpmeta")?;
    let after = start + b"<x:xmpmeta".len();
    let end_rel = find_bytes(&data[after..], b"</x:xmpmeta>")?;
    let end = after + end_rel + b"</x:xmpmeta>".len();

    let xmp = std::str::from_utf8(&data[start..end]).ok()?;

    for field in &[
        "exif:DateTimeOriginal",
        "xmp:CreateDate",
        "photoshop:DateCreated",
        "dc:date",
    ] {
        if let Some(dt) = xmp_field_date(xmp, field) {
            return Some(dt);
        }
    }
    None
}

fn xmp_field_date(xmp: &str, field: &str) -> Option<DateTime<Utc>> {
    let attr = format!("{}=\"", field);
    if let Some(pos) = xmp.find(&attr) {
        let s = pos + attr.len();
        if let Some(e) = xmp[s..].find('"') {
            if let Some(dt) = parse_iso8601(&xmp[s..s + e]) {
                return Some(dt);
            }
        }
    }
    let open = format!("<{}>", field);
    let close = format!("</{}>", field);
    if let Some(pos) = xmp.find(&open) {
        let s = pos + open.len();
        if let Some(e) = xmp[s..].find(&close) {
            if let Some(dt) = parse_iso8601(&xmp[s..s + e]) {
                return Some(dt);
            }
        }
    }
    None
}

fn parse_iso8601(s: &str) -> Option<DateTime<Utc>> {
    use chrono::{NaiveDate, NaiveDateTime};
    let s = s.trim();
    if let Ok(dt) = DateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%:z") {
        return Some(dt.with_timezone(&Utc));
    }
    if let Ok(dt) = DateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%z") {
        return Some(dt.with_timezone(&Utc));
    }
    if let Ok(ndt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
        return Some(Utc.from_utc_datetime(&ndt));
    }
    if let Ok(nd) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return Some(Utc.from_utc_datetime(&nd.and_hms_opt(0, 0, 0)?));
    }
    None
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

fn mtime_fallback(path: &Path) -> ExifResult {
    if let Ok(m) = std::fs::metadata(path) {
        if let Ok(mtime) = m.modified() {
            return ExifResult::FromFileMtime(mtime.into());
        }
    }
    ExifResult::Missing
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_extract_date_returns_mtime_fallback() {
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(b"not an image").unwrap();

        let result = extract_date(file.path());
        match result {
            ExifResult::FromFileMtime(_) | ExifResult::FromCreatedTime(_) | ExifResult::Missing => {}
            _ => panic!("Expected mtime/created/missing fallback, got {:?}", result),
        }
    }

    #[test]
    fn test_filename_compact_android() {
        let p = std::path::Path::new("IMG_20231005_143020.jpg");
        let dt = try_filename_date(p).unwrap();
        assert_eq!(dt.format("%Y-%m-%d %H:%M:%S").to_string(), "2023-10-05 14:30:20");
    }

    #[test]
    fn test_filename_pixel() {
        let p = std::path::Path::new("PXL_20231005_143020123.jpg");
        let dt = try_filename_date(p).unwrap();
        assert_eq!(dt.format("%Y-%m-%d %H:%M:%S").to_string(), "2023-10-05 14:30:20");
    }

    #[test]
    fn test_filename_screenshot_sep() {
        let p = std::path::Path::new("Screenshot_2023-10-05-14-30-20.png");
        let dt = try_filename_date(p).unwrap();
        assert_eq!(dt.format("%Y-%m-%d").to_string(), "2023-10-05");
    }

    #[test]
    fn test_filename_whatsapp() {
        let p = std::path::Path::new("WhatsApp Image 2023-10-05 at 14.30.20.jpg");
        let dt = try_filename_date(p).unwrap();
        assert_eq!(dt.format("%Y-%m-%d").to_string(), "2023-10-05");
    }

    #[test]
    fn test_filename_date_only() {
        let p = std::path::Path::new("2023-10-05.jpg");
        let dt = try_filename_date(p).unwrap();
        assert_eq!(dt.format("%Y-%m-%d %H:%M:%S").to_string(), "2023-10-05 00:00:00");
    }

    #[test]
    fn test_filename_no_date() {
        let p = std::path::Path::new("random_vacation_photo.jpg");
        assert!(try_filename_date(p).is_none());
    }
}
