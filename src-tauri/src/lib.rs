pub mod db;
pub mod error;
pub mod state;
pub mod exif;
pub mod hasher;
pub mod thumbnail;
pub mod video_meta;
pub mod commands;
pub mod media_server;

use std::sync::Arc;
use state::AppState;

#[tauri::command]
async fn init_archive(
    state: tauri::State<'_, Arc<AppState>>,
    archive_path: String,
) -> Result<(), error::AppError> {
    state.reinit_db(&archive_path)?;
    state.set_archive_path(archive_path.clone());
    let db = state.db();
    tauri::async_runtime::spawn_blocking(move || {
        commands::run_migrations(&archive_path, &*db)
    })
    .await
    .map_err(|e| error::AppError::Internal { message: e.to_string() })??;
    Ok(())
}

#[tauri::command]
fn get_image_count(state: tauri::State<'_, Arc<AppState>>) -> Result<i64, error::AppError> {
    state.db().get_image_count()
}

#[tauri::command]
fn get_all_images(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<db::image::Image>, error::AppError> {
    state.db().get_all_images()
}

#[tauri::command]
fn get_images_by_date(state: tauri::State<'_, Arc<AppState>>, year: i32, month: Option<i32>) -> Result<Vec<db::image::Image>, error::AppError> {
    state.db().get_images_by_date(year, month)
}

#[tauri::command]
fn get_all_groups(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<db::group::GroupWithCount>, error::AppError> {
    state.db().get_all_groups()
}

#[tauri::command]
fn create_group(state: tauri::State<'_, Arc<AppState>>, name: String) -> Result<i64, error::AppError> {
    state.db().create_group(&name)
}

#[tauri::command]
fn delete_group(state: tauri::State<'_, Arc<AppState>>, id: i64) -> Result<(), error::AppError> {
    state.db().delete_group(id)
}

#[tauri::command]
fn add_image_to_group(state: tauri::State<'_, Arc<AppState>>, image_id: String, group_id: i64) -> Result<(), error::AppError> {
    state.db().add_image_to_group(&image_id, group_id)
}

#[tauri::command]
fn remove_image_from_group(state: tauri::State<'_, Arc<AppState>>, image_id: String, group_id: i64) -> Result<(), error::AppError> {
    state.db().remove_image_from_group(&image_id, group_id)
}

#[tauri::command]
fn get_images_in_group(state: tauri::State<'_, Arc<AppState>>, group_id: i64) -> Result<Vec<String>, error::AppError> {
    state.db().get_images_in_group(group_id)
}

#[tauri::command]
fn get_groups_for_image(state: tauri::State<'_, Arc<AppState>>, image_id: String) -> Result<Vec<i64>, error::AppError> {
    state.db().get_groups_for_image(&image_id)
}

#[tauri::command]
fn update_group(state: tauri::State<'_, Arc<AppState>>, id: i64, name: String) -> Result<(), error::AppError> {
    state.db().update_group(id, &name)
}

#[tauri::command]
fn set_group_cover(state: tauri::State<'_, Arc<AppState>>, group_id: i64, image_id: String) -> Result<(), error::AppError> {
    state.db().set_group_cover(group_id, &image_id)
}

#[tauri::command]
async fn scan_source(source_path: String) -> Result<Vec<commands::ScannedImage>, error::AppError> {
    tauri::async_runtime::spawn_blocking(move || commands::scan_source(&source_path))
        .await
        .map_err(|e| error::AppError::Internal { message: e.to_string() })?
}

#[tauri::command]
async fn analyze_image(scanned: commands::ScannedImage) -> Result<commands::AnalyzedImage, error::AppError> {
    tauri::async_runtime::spawn_blocking(move || commands::analyze_image(&scanned))
        .await
        .map_err(|e| error::AppError::Internal { message: e.to_string() })?
}

#[tauri::command]
async fn analyze_images(
    app: tauri::AppHandle,
    scanned: Vec<commands::ScannedImage>,
) -> Result<Vec<commands::AnalyzedImage>, error::AppError> {
    tauri::async_runtime::spawn_blocking(move || commands::analyze_images_batch(scanned, &app))
        .await
        .map_err(|e| error::AppError::Internal { message: e.to_string() })?
}

#[tauri::command]
async fn create_import_plan(
    state: tauri::State<'_, Arc<AppState>>,
    images: Vec<commands::AnalyzedImage>,
) -> Result<commands::ImportPlan, error::AppError> {
    let db = state.db();
    tauri::async_runtime::spawn_blocking(move || commands::create_import_plan(images, &*db))
        .await
        .map_err(|e| error::AppError::Internal { message: e.to_string() })?
}

#[tauri::command]
async fn execute_import(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    plan: commands::ImportPlan,
    resolutions: Vec<commands::ImportResolution>,
    archive_path: String,
) -> Result<commands::ImportResult, error::AppError> {
    let db = state.db();
    tauri::async_runtime::spawn_blocking(move || {
        commands::execute_import(plan, resolutions, &archive_path, &*db, &app)
    })
    .await
    .map_err(|e| error::AppError::Internal { message: e.to_string() })?
}

#[tauri::command]
async fn generate_temp_thumbnail(source_path: String) -> Result<String, error::AppError> {
    tauri::async_runtime::spawn_blocking(move || commands::generate_temp_thumbnail(&source_path))
        .await
        .map_err(|e| error::AppError::Internal { message: e.to_string() })?
}

#[tauri::command]
fn cleanup_temp_thumbnails() -> Result<(), error::AppError> {
    commands::cleanup_temp_thumbnails()
}

#[tauri::command]
async fn generate_temp_thumbnails_batch(
    source_paths: Vec<String>,
    app: tauri::AppHandle,
) -> Result<std::collections::HashMap<String, String>, error::AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        commands::generate_temp_thumbnails_batch(source_paths, &app)
    })
    .await
    .map_err(|e| error::AppError::Internal { message: e.to_string() })?
}

#[tauri::command]
async fn pre_generate_all_thumbnails_batch(
    analyzed: Vec<commands::AnalyzedImage>,
    archive_path: String,
    app: tauri::AppHandle,
) -> Result<(), error::AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        commands::pre_generate_all_thumbnails_batch(&analyzed, &archive_path, &app)
    })
    .await
    .map_err(|e| error::AppError::Internal { message: e.to_string() })?
}

#[tauri::command]
async fn cleanup_unimported_thumbnails(
    state: tauri::State<'_, Arc<AppState>>,
    hashes: Vec<String>,
    archive_path: String,
) -> Result<(), error::AppError> {
    let db = state.db();
    tauri::async_runtime::spawn_blocking(move || {
        commands::cleanup_unimported_thumbnails(hashes, &archive_path, &*db)
    })
    .await
    .map_err(|e| error::AppError::Internal { message: e.to_string() })?
}

#[tauri::command]
async fn export_group(
    state: tauri::State<'_, Arc<AppState>>,
    group_id: i64,
    dest_path: String,
) -> Result<commands::ExportResult, error::AppError> {
    let archive_path = state.get_archive_path().ok_or_else(|| error::AppError::ArchiveNotFound {
        path: "No archive path set".to_string(),
    })?;
    let db = state.db();
    tauri::async_runtime::spawn_blocking(move || {
        commands::export_group(&db, group_id, &dest_path, &archive_path)
    })
    .await
    .map_err(|e| error::AppError::Internal { message: e.to_string() })?
}

#[tauri::command]
async fn rescan_archive(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<commands::RescanResult, error::AppError> {
    let archive_path = state.get_archive_path().ok_or_else(|| error::AppError::ArchiveNotFound {
        path: "No archive path set".to_string(),
    })?;
    let db = state.db();
    tauri::async_runtime::spawn_blocking(move || {
        commands::rescan_archive(&archive_path, &*db)
    })
    .await
    .map_err(|e| error::AppError::Internal { message: e.to_string() })?
}

#[tauri::command]
async fn regenerate_thumbnails(
    state: tauri::State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<commands::RegenerateThumbnailsResult, error::AppError> {
    let archive_path = state.get_archive_path().ok_or_else(|| error::AppError::ArchiveNotFound {
        path: "No archive path set".to_string(),
    })?;
    let db = state.db();
    tauri::async_runtime::spawn_blocking(move || {
        commands::regenerate_thumbnails(&archive_path, &*db, &app)
    })
    .await
    .map_err(|e| error::AppError::Internal { message: e.to_string() })?
}

#[derive(Debug, serde::Serialize)]
struct DeleteFilesResult {
    deleted: usize,
    failed: Vec<String>,
}

#[tauri::command]
fn delete_files(paths: Vec<String>) -> DeleteFilesResult {
    let mut deleted = 0;
    let mut failed = Vec::new();
    let mut parent_dirs: Vec<std::path::PathBuf> = Vec::new();

    for path in &paths {
        let p = std::path::Path::new(path);
        match std::fs::remove_file(p) {
            Ok(()) => {
                deleted += 1;
                if let Some(parent) = p.parent() {
                    let pb = parent.to_path_buf();
                    if !parent_dirs.contains(&pb) {
                        parent_dirs.push(pb);
                    }
                }
            }
            Err(_) => failed.push(path.clone()),
        }
    }

    // Sort deepest first so children are checked before parents
    parent_dirs.sort_by(|a, b| b.components().count().cmp(&a.components().count()));
    for dir in parent_dirs {
        let _ = std::fs::remove_dir(&dir); // no-op if non-empty
    }

    DeleteFilesResult { deleted, failed }
}

#[tauri::command]
async fn remove_missing_images(
    state: tauri::State<'_, Arc<AppState>>,
    ids: Vec<String>,
) -> Result<usize, error::AppError> {
    let db = state.db();
    tauri::async_runtime::spawn_blocking(move || {
        commands::remove_missing_images(&ids, &*db)
    })
    .await
    .map_err(|e| error::AppError::Internal { message: e.to_string() })?
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, config: serde_json::Value) -> Result<(), error::AppError> {
    use tauri::Manager;
    let dir = app.path().app_data_dir()
        .map_err(|e| error::AppError::FileWrite { path: "app_data_dir".into(), message: e.to_string() })?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| error::AppError::FileWrite { path: dir.to_string_lossy().into(), message: e.to_string() })?;
    let path = dir.join("app_config.json");
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| error::AppError::FileWrite { path: path.to_string_lossy().into(), message: e.to_string() })?;
    std::fs::write(&path, json)
        .map_err(|e| error::AppError::FileWrite { path: path.to_string_lossy().into(), message: e.to_string() })?;
    Ok(())
}

#[tauri::command]
fn load_config(app: tauri::AppHandle) -> Option<serde_json::Value> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().ok()?;
    let path = dir.join("app_config.json");
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

#[tauri::command]
fn toggle_favourite(state: tauri::State<'_, Arc<AppState>>, image_id: String, is_favourite: bool) -> Result<(), error::AppError> {
    state.db().set_image_favourite(&image_id, is_favourite)
}

#[tauri::command]
fn get_favourite_images(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<db::image::Image>, error::AppError> {
    state.db().get_favourite_images()
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
async fn save_video_thumbnail(
    state: tauri::State<'_, Arc<AppState>>,
    image_id: String,
    jpeg_bytes: Vec<u8>,
) -> Result<String, error::AppError> {
    let archive_path = state.get_archive_path().ok_or_else(|| error::AppError::ArchiveNotFound {
        path: "No archive path set".to_string(),
    })?;
    let db = state.db();
    tauri::async_runtime::spawn_blocking(move || {
        commands::save_video_thumbnail_impl(&image_id, jpeg_bytes, &archive_path, &*db)
    })
    .await
    .map_err(|e| error::AppError::Internal { message: e.to_string() })?
}

#[tauri::command]
fn get_videos_needing_thumbnails(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<commands::VideoStub>, error::AppError> {
    commands::get_videos_needing_thumbnails_impl(&*state.db())
}

#[tauri::command]
fn get_videos_needing_transcode(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<commands::VideoStub>, error::AppError> {
    commands::get_videos_needing_transcode_impl(&*state.db())
}

#[tauri::command]
async fn transcode_video(
    state: tauri::State<'_, Arc<AppState>>,
    image_id: String,
    file_path: String,
) -> Result<String, error::AppError> {
    let archive_path = state.get_archive_path().ok_or_else(|| error::AppError::ArchiveNotFound {
        path: "No archive path set".to_string(),
    })?;
    let db = state.db();
    tauri::async_runtime::spawn_blocking(move || {
        commands::transcode_video_impl(&image_id, &file_path, &archive_path, &*db)
    })
    .await
    .map_err(|e| error::AppError::Internal { message: e.to_string() })?
}

#[tauri::command]
fn get_media_server_port(state: tauri::State<'_, Arc<AppState>>) -> u16 {
    state.media_port()
}

#[tauri::command]
fn get_image_locations(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<commands::locations::ImageLocation>, error::AppError> {
    state.db().get_image_locations()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let media_port = tauri::async_runtime::block_on(media_server::start());
    let app_state = Arc::new(
        AppState::new(std::path::PathBuf::from("/tmp/archivist.db"), media_port).expect("Failed to init db")
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            init_archive,
            get_image_count,
            get_all_images,
            get_images_by_date,
            get_all_groups,
            create_group,
            delete_group,
            add_image_to_group,
            remove_image_from_group,
            get_images_in_group,
            get_groups_for_image,
            update_group,
            set_group_cover,
            scan_source,
            analyze_image,
            analyze_images,
            create_import_plan,
            execute_import,
            generate_temp_thumbnail,
            generate_temp_thumbnails_batch,
            pre_generate_all_thumbnails_batch,
            cleanup_temp_thumbnails,
            cleanup_unimported_thumbnails,
            export_group,
            rescan_archive,
            regenerate_thumbnails,
            remove_missing_images,
            delete_files,
            save_config,
            load_config,
            path_exists,
            toggle_favourite,
            get_favourite_images,
            save_video_thumbnail,
            get_videos_needing_thumbnails,
            get_videos_needing_transcode,
            transcode_video,
            get_media_server_port,
            get_image_locations,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}