use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use crate::error::AppError;
use crate::commands::video::VideoStub;

/// The one running ffmpeg, with the id of the video it converts. Only the latest request
/// runs: the user is looking at that video, so browsing through ten untranscoded videos
/// must not leave ten ffmpeg processes fighting for the CPU.
// ponytail: single global slot; a small pool if background (non-interactive) transcoding is ever added.
static CURRENT: Mutex<Option<(String, Child)>> = Mutex::new(None);

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
    // Written aside and renamed on success: an interrupted run never leaves a broken .webm
    let partial = web_dir.join(format!("{}.webm.part", id));

    let outcome = run_latest(id, ffmpeg_command(&input, &partial));
    if !matches!(outcome, Ok(true)) {
        let _ = std::fs::remove_file(&partial);
    }
    match outcome {
        Ok(true) => {}
        Ok(false) => return Err(AppError::FileWrite {
            path: output.to_string_lossy().to_string(),
            message: "ffmpeg transcode failed".to_string(),
        }),
        Err(e) => return Err(e),
    }
    std::fs::rename(&partial, &output).map_err(|e| AppError::FileWrite {
        path: output.to_string_lossy().to_string(),
        message: e.to_string(),
    })?;

    let web_path = format!(".archivist/web/{}.webm", id);
    db.update_web_path(id, &web_path)?;
    Ok(web_path)
}

fn ffmpeg_command(input: &Path, output: &Path) -> Command {
    let mut cmd = Command::new(ffmpeg_sidecar::paths::ffmpeg_path());
    // VP8 (libvpx)/Opus WebM: open codecs, no proprietary GStreamer plugins required on Linux.
    // `-f webm`: the `.part` extension doesn't tell ffmpeg the container.
    cmd.arg("-y").arg("-hide_banner")
        .arg("-i").arg(input)
        .args(["-c:v", "libvpx", "-b:v", "2M", "-deadline", "realtime", "-cpu-used", "8", "-threads", "0"])
        .args(["-c:a", "libopus", "-b:a", "128k", "-f", "webm"])
        .arg(output)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    cmd
}

/// Runs `cmd` as the only transcode, killing the one in progress (if any).
/// Ok(success), or `Cancelled` when a newer request killed this one meanwhile.
fn run_latest(id: &str, mut cmd: Command) -> Result<bool, AppError> {
    {
        let mut current = lock();
        if let Some((_, mut old)) = current.take() {
            let _ = old.kill();
            let _ = old.wait();
        }
        let child = cmd.spawn().map_err(|e| AppError::Internal { message: format!("ffmpeg: {e}") })?;
        *current = Some((id.to_string(), child));
    }
    // Poll instead of wait(): the lock must stay free so a newer request can kill this child
    loop {
        std::thread::sleep(Duration::from_millis(100));
        let mut current = lock();
        let Some((_, child)) = current.as_mut().filter(|(running, _)| running == id) else {
            return Err(AppError::Cancelled);
        };
        match child.try_wait() {
            Ok(None) => continue,
            Ok(Some(status)) => { current.take(); return Ok(status.success()); }
            Err(_) => { current.take(); return Ok(false); }
        }
    }
}

fn lock() -> std::sync::MutexGuard<'static, Option<(String, Child)>> {
    CURRENT.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn get_videos_needing_transcode_impl(db: &crate::db::Database) -> Result<Vec<VideoStub>, AppError> {
    db.get_videos_needing_transcode()
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    /// A newer request kills the running one, which reports Cancelled; the newer one completes.
    #[test]
    fn newer_request_cancels_running_one() {
        let first = std::thread::spawn(|| {
            let mut cmd = Command::new("sleep");
            cmd.arg("5");
            run_latest("first", cmd)
        });
        std::thread::sleep(Duration::from_millis(300));
        assert!(matches!(run_latest("second", Command::new("true")), Ok(true)));
        assert!(matches!(first.join().unwrap(), Err(AppError::Cancelled)));
    }
}
