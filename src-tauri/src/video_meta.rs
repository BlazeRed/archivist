use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use chrono::{DateTime, TimeZone, Utc};
use regex::Regex;

pub struct VideoMeta {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_ms: Option<i64>,
    pub creation_time: Option<DateTime<Utc>>,
    pub codec: Option<String>,
    pub rotation: Option<i32>,
}

/// Parse metadata from a video file.
/// Tries ffmpeg stderr probe first (all formats); falls back to MP4 atom parser.
pub fn parse_video_meta(path: &Path) -> VideoMeta {
    if let Some(meta) = probe_via_ffmpeg(path) {
        return meta;
    }
    parse_mp4_atoms(path).unwrap_or(VideoMeta {
        width: None,
        height: None,
        duration_ms: None,
        creation_time: None,
        codec: None,
        rotation: None,
    })
}

/// Returns true when the codec + container combination plays natively in all WebViews
/// without transcoding. `path` is used only for its extension.
pub fn is_web_compatible(codec: &Option<String>, path: &Path) -> bool {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    let web_containers = ["mp4", "mov", "m4v", "webm"];
    if !web_containers.iter().any(|c| *c == ext.as_str()) {
        return false;
    }

    // On Linux, WebKitGTK needs gstreamer1.0-libav for h264 which is not bundled.
    // Transcode h264 to VP9 WebM instead (works with gstreamer1.0-plugins-good).
    let h264_ok = !cfg!(target_os = "linux");

    match codec.as_deref() {
        Some("h264") => h264_ok,
        Some(c) => matches!(c, "vp8" | "vp9" | "av1"),
        None => false,
    }
}

// ---------------------------------------------------------------------------
// ffmpeg stderr probe
// ---------------------------------------------------------------------------

fn probe_via_ffmpeg(path: &Path) -> Option<VideoMeta> {
    let path_str = path.to_str()?;
    let ffmpeg = ffmpeg_sidecar::paths::ffmpeg_path();

    let output = std::process::Command::new(&ffmpeg)
        .args(["-hide_banner", "-i", path_str])
        .output()
        .ok()?;

    // ffmpeg exits non-zero when no output file is given — that is expected.
    // All relevant info is in stderr.
    let info = String::from_utf8_lossy(&output.stderr);

    // Duration: HH:MM:SS.cs  (cs = centiseconds, 2 digits)
    let duration_ms = {
        let re = Regex::new(r"Duration:\s*(\d+):(\d+):(\d+)\.(\d+)").ok()?;
        re.captures(&info).and_then(|c| {
            let h = c[1].parse::<i64>().ok()?;
            let m = c[2].parse::<i64>().ok()?;
            let s = c[3].parse::<i64>().ok()?;
            let cs = c[4].parse::<i64>().ok()?;
            Some((h * 3_600 + m * 60 + s) * 1_000 + cs * 10)
        })
    };

    // First Video stream line: "Stream #N:M...: Video: <codec> ... WxH"
    let (codec, width, height) = parse_video_stream(&info);

    // rotate metadata tag (older FFmpeg / MP4 side-data)
    let rotation = {
        let re = Regex::new(r"rotate\s*:\s*(-?\d+)").ok()?;
        re.captures(&info)
            .and_then(|c| c[1].parse::<i32>().ok())
    };

    // creation_time metadata tag
    let creation_time = {
        let re = Regex::new(r"creation_time\s*:\s*(\S+)").ok()?;
        re.captures(&info)
            .and_then(|c| DateTime::parse_from_rfc3339(&c[1]).ok())
            .map(|dt| dt.with_timezone(&Utc))
    };

    Some(VideoMeta {
        width,
        height,
        duration_ms,
        creation_time,
        codec,
        rotation,
    })
}

fn parse_video_stream(info: &str) -> (Option<String>, Option<u32>, Option<u32>) {
    let re = match Regex::new(
        r"Stream #[^:\n]+:[^\n]*Video:\s*(\w+)[^\n]*?[, \(](\d{2,5})x(\d{2,5})"
    ) {
        Ok(r) => r,
        Err(_) => return (None, None, None),
    };

    if let Some(c) = re.captures(info) {
        let codec = Some(c[1].to_lowercase());
        let w = c[2].parse::<u32>().ok();
        let h = c[3].parse::<u32>().ok();
        return (codec, w, h);
    }

    // Fallback: extract codec without dimensions
    let codec_re = match Regex::new(r"Stream #[^:\n]+:[^\n]*Video:\s*(\w+)") {
        Ok(r) => r,
        Err(_) => return (None, None, None),
    };
    let codec = codec_re.captures(info).map(|c| c[1].to_lowercase());
    (codec, None, None)
}

// ---------------------------------------------------------------------------
// MP4 atom parser (fallback for when ffmpeg is unavailable / fails)
// ---------------------------------------------------------------------------

fn parse_mp4_atoms(path: &Path) -> Option<VideoMeta> {
    let mut f = File::open(path).ok()?;
    let file_size = f.metadata().ok()?.len();

    let (moov_start, moov_size) = find_box(&mut f, 0, file_size, b"moov")?;
    let moov_end = moov_start + moov_size;

    let mut duration_ms: Option<i64> = None;
    let mut creation_time: Option<DateTime<Utc>> = None;
    let mut best_dims: Option<(u32, u32)> = None;

    let mut pos = moov_start;
    while pos + 8 <= moov_end {
        let box_size_raw = read_u32(&mut f, pos)? as u64;
        f.seek(SeekFrom::Start(pos + 4)).ok()?;
        let mut tname = [0u8; 4];
        if f.read_exact(&mut tname).is_err() { break; }
        let box_size = if box_size_raw == 0 { moov_end - pos } else { box_size_raw };
        if box_size < 8 { break; }
        let data_start = pos + 8;

        match &tname {
            b"mvhd" => {
                if let Some((dur, ct)) = parse_mvhd(&mut f, data_start) {
                    duration_ms = Some(dur);
                    creation_time = ct;
                }
            }
            b"trak" => {
                let trak_end = pos + box_size;
                if let Some((tkhd_start, _)) = find_box(&mut f, data_start, trak_end, b"tkhd") {
                    if let Some((w, h)) = parse_tkhd(&mut f, tkhd_start) {
                        if w > 0 && h > 0 {
                            let area = (w as u64) * (h as u64);
                            let best = best_dims.map(|(bw, bh)| (bw as u64) * (bh as u64)).unwrap_or(0);
                            if area > best { best_dims = Some((w, h)); }
                        }
                    }
                }
            }
            _ => {}
        }
        pos += box_size;
    }

    Some(VideoMeta {
        width: best_dims.map(|(w, _)| w),
        height: best_dims.map(|(_, h)| h),
        duration_ms,
        creation_time,
        codec: Some("h264".to_string()), // MP4 atom path assumes h264 (most common)
        rotation: None,
    })
}

fn find_box(f: &mut File, start: u64, end: u64, name: &[u8; 4]) -> Option<(u64, u64)> {
    let mut pos = start;
    while pos + 8 <= end {
        let size_raw = read_u32(f, pos)? as u64;
        f.seek(SeekFrom::Start(pos + 4)).ok()?;
        let mut tname = [0u8; 4];
        if f.read_exact(&mut tname).is_err() { break; }
        let box_size = if size_raw == 0 { end - pos } else { size_raw };
        if box_size < 8 { break; }
        if &tname == name { return Some((pos + 8, box_size - 8)); }
        pos += box_size;
    }
    None
}

fn parse_mvhd(f: &mut File, data_start: u64) -> Option<(i64, Option<DateTime<Utc>>)> {
    let version = read_u8(f, data_start)?;
    let (creation_raw, timescale, duration_raw): (u64, u32, u64);

    if version == 1 {
        creation_raw = read_u64(f, data_start + 4)?;
        timescale = read_u32(f, data_start + 20)?;
        duration_raw = read_u64(f, data_start + 24)?;
    } else {
        creation_raw = read_u32(f, data_start + 4)? as u64;
        timescale = read_u32(f, data_start + 12)?;
        duration_raw = read_u32(f, data_start + 16)? as u64;
    }

    if timescale == 0 { return None; }
    let duration_ms = (duration_raw as f64 / timescale as f64 * 1000.0) as i64;

    // QuickTime epoch is 1904-01-01; Unix epoch offset = 2082844800s
    let creation_time = if creation_raw > 0 {
        let unix_secs = creation_raw as i64 - 2_082_844_800;
        Utc.timestamp_opt(unix_secs, 0).single()
    } else {
        None
    };

    Some((duration_ms, creation_time))
}

fn parse_tkhd(f: &mut File, data_start: u64) -> Option<(u32, u32)> {
    let version = read_u8(f, data_start)?;
    let w_offset = if version == 1 { data_start + 88 } else { data_start + 76 };
    let w_fixed = read_u32(f, w_offset)?;
    let h_fixed = read_u32(f, w_offset + 4)?;
    Some((w_fixed >> 16, h_fixed >> 16))
}

fn read_u8(f: &mut File, pos: u64) -> Option<u8> {
    f.seek(SeekFrom::Start(pos)).ok()?;
    let mut buf = [0u8; 1];
    f.read_exact(&mut buf).ok()?;
    Some(buf[0])
}

fn read_u32(f: &mut File, pos: u64) -> Option<u32> {
    f.seek(SeekFrom::Start(pos)).ok()?;
    let mut buf = [0u8; 4];
    f.read_exact(&mut buf).ok()?;
    Some(u32::from_be_bytes(buf))
}

fn read_u64(f: &mut File, pos: u64) -> Option<u64> {
    f.seek(SeekFrom::Start(pos)).ok()?;
    let mut buf = [0u8; 8];
    f.read_exact(&mut buf).ok()?;
    Some(u64::from_be_bytes(buf))
}
