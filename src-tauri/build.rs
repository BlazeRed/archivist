fn main() {
    // Download ffmpeg to src-tauri/binaries/ffmpeg-{target_triple}
    // so Tauri's externalBin bundler finds it at "binaries/ffmpeg".
    //
    // auto_download() places the binary next to the build-script exe
    // (target/debug/build/archivist-*/ffmpeg), NOT in src-tauri/binaries/.
    // We run the download first, then copy the result to the Tauri-expected path.
    let target = std::env::var("TARGET").unwrap_or_else(|_| "x86_64-unknown-linux-gnu".to_string());
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");
    let binaries_dir = std::path::PathBuf::from(&manifest).join("binaries");
    std::fs::create_dir_all(&binaries_dir).ok();

    // Windows auto_download places ffmpeg.exe; the suffix must match on both
    // the source lookup and the Tauri-expected destination name.
    let exe_suffix = if cfg!(windows) { ".exe" } else { "" };

    let ffmpeg_dest = binaries_dir.join(format!("ffmpeg-{}{}", target, exe_suffix));

    if !ffmpeg_dest.exists() {
        match ffmpeg_sidecar::download::auto_download() {
            Ok(()) => {
                // Binary was placed next to the build-script executable
                if let Ok(exe) = std::env::current_exe() {
                    let dir = exe.parent().unwrap();
                    let downloaded = dir.join(format!("ffmpeg{}", exe_suffix));
                    if downloaded.exists() {
                        if let Err(e) = std::fs::copy(&downloaded, &ffmpeg_dest) {
                            println!("cargo:warning=ffmpeg copy to binaries/ failed: {e}");
                        }
                    } else {
                        println!("cargo:warning=ffmpeg binary not found after download (looked at {downloaded:?})");
                    }
                }
            }
            Err(e) => println!("cargo:warning=ffmpeg auto-download failed: {e}"),
        }
    }

    // Copy ffprobe alongside ffmpeg if available (Linux/Windows builds include it).
    // macOS auto_download does not include ffprobe — absence is silently ignored.
    let ffprobe_dest = binaries_dir.join(format!("ffprobe-{}{}", target, exe_suffix));
    if !ffprobe_dest.exists() {
        if let Ok(exe) = std::env::current_exe() {
            let downloaded = exe.parent().unwrap().join(format!("ffprobe{}", exe_suffix));
            if downloaded.exists() {
                if let Err(e) = std::fs::copy(&downloaded, &ffprobe_dest) {
                    println!("cargo:warning=ffprobe copy to binaries/ failed: {e}");
                }
            }
            // No warning if absent — not all platform downloads include ffprobe
        }
    }

    tauri_build::build();
}
