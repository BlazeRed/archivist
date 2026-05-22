use std::path::PathBuf;
use crate::error::AppError;
use crate::commands::video::VideoStub;

pub fn transcode_video_impl(
    id: &str,
    file_path_rel: &str,
    archive_path: &str,
    db: &crate::db::Database,
) -> Result<String, AppError> {
    let input = PathBuf::from(archive_path).join(file_path_rel);
    let web_dir = PathBuf::from(archive_path).join(".archivist/web");

    std::fs::create_dir_all(&web_dir).map_err(|e| AppError::FileWrite {
        path: web_dir.to_string_lossy().to_string(),
        message: e.to_string(),
    })?;

    let output = web_dir.join(format!("{}.webm", id));
    let output_str = output.to_string_lossy().to_string();
    let input_str = input.to_string_lossy().to_string();

    // VP9/Opus WebM: open codec, no proprietary GStreamer plugins required on Linux
    let result = std::process::Command::new(ffmpeg_sidecar::paths::ffmpeg_path())
        .args([
            "-y",
            "-hide_banner",
            "-i", &input_str,
            "-c:v", "libvpx",
            "-b:v", "2M",
            "-deadline", "realtime",
            "-cpu-used", "8",
            "-threads", "0",
            "-c:a", "libopus",
            "-b:a", "128k",
            &output_str,
        ])
        .output();

    let success = result
        .map(|out| out.status.success() && output.exists())
        .unwrap_or(false);

    if !success {
        return Err(AppError::FileWrite {
            path: output_str,
            message: "ffmpeg transcode failed".to_string(),
        });
    }

    let web_path = format!(".archivist/web/{}.webm", id);
    db.update_web_path(id, &web_path)?;
    Ok(web_path)
}

pub fn get_videos_needing_transcode_impl(db: &crate::db::Database) -> Result<Vec<VideoStub>, AppError> {
    db.get_videos_needing_transcode()
}
