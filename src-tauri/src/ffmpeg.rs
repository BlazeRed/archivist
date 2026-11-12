use std::path::PathBuf;
use std::process::Command;

/// Bundled `archivist-ffmpeg` next to the exe if present. The name is distinct from
/// `ffmpeg` so Linux packages (installed to /usr/bin) never collide with the distro one.
/// Otherwise ffmpeg-sidecar lookup: `<exe dir>/ffmpeg` (dev, from build.rs), then `ffmpeg` on PATH.
fn path() -> PathBuf {
    let bundled = std::env::current_exe().ok().and_then(|exe| {
        exe.parent()
            .map(|dir| dir.join(format!("archivist-ffmpeg{}", std::env::consts::EXE_SUFFIX)))
    });
    match bundled {
        Some(p) if p.exists() => p,
        _ => ffmpeg_sidecar::paths::ffmpeg_path(),
    }
}

/// ffmpeg command that opens no console window on Windows.
pub fn command() -> Command {
    #[cfg_attr(not(windows), allow(unused_mut))]
    let mut cmd = Command::new(path());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}
