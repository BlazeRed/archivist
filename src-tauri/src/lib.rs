pub mod db;
pub mod error;
pub mod state;
pub mod exif;
pub mod hasher;
pub mod thumbnail;
pub mod commands;

use std::sync::Arc;
use state::AppState;

#[tauri::command]
fn init_archive(state: tauri::State<'_, Arc<AppState>>, archive_path: String) -> Result<(), error::AppError> {
    state.reinit_db(&archive_path)?;
    state.set_archive_path(archive_path);
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
fn scan_source(source_path: String) -> Result<Vec<commands::ScannedImage>, error::AppError> {
    commands::scan_source(&source_path)
}

#[tauri::command]
fn analyze_image(scanned: commands::ScannedImage) -> Result<commands::AnalyzedImage, error::AppError> {
    commands::analyze_image(&scanned)
}

#[tauri::command]
fn create_import_plan(state: tauri::State<'_, Arc<AppState>>, images: Vec<commands::AnalyzedImage>) -> Result<commands::ImportPlan, error::AppError> {
    let db = state.db();
    commands::create_import_plan(images, &db)
}

#[tauri::command]
fn execute_import(
    state: tauri::State<'_, Arc<AppState>>,
    plan: commands::ImportPlan,
    resolutions: Vec<commands::ImportResolution>,
    archive_path: String,
) -> Result<commands::ImportResult, error::AppError> {
    let db = state.db();
    commands::execute_import(plan, resolutions, &archive_path, &db)
}

#[tauri::command]
fn import_single_image(
    state: tauri::State<'_, Arc<AppState>>,
    image: commands::AnalyzedImage,
    resolution: Option<commands::ImportResolution>,
    archive_path: String,
) -> Result<commands::ImportSingleResult, error::AppError> {
    let db = state.db();
    commands::import_single_image(image, resolution, &archive_path, &db)
}

#[tauri::command]
fn generate_temp_thumbnail(source_path: String) -> Result<String, error::AppError> {
    commands::generate_temp_thumbnail(&source_path)
}

#[tauri::command]
fn cleanup_temp_thumbnails() -> Result<(), error::AppError> {
    commands::cleanup_temp_thumbnails()
}

#[tauri::command]
fn export_group(
    state: tauri::State<'_, Arc<AppState>>,
    group_id: i64,
    dest_path: String,
) -> Result<commands::ExportResult, error::AppError> {
    let archive_path = state.get_archive_path().ok_or_else(|| error::AppError::ArchiveNotFound {
        path: "No archive path set".to_string(),
    })?;
    let db = state.db();
    commands::export_group(&db, group_id, &dest_path, &archive_path)
}

#[tauri::command]
fn rescan_archive(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<commands::RescanResult, error::AppError> {
    let archive_path = state.get_archive_path().ok_or_else(|| error::AppError::ArchiveNotFound {
        path: "No archive path set".to_string(),
    })?;
    let db = state.db();
    commands::rescan_archive(&archive_path, &db)
}

#[tauri::command]
fn delete_files(paths: Vec<String>) -> usize {
    let mut count = 0;
    for path in paths {
        if std::fs::remove_file(&path).is_ok() {
            count += 1;
        }
    }
    count
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
fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Arc::new(
        AppState::new(std::path::PathBuf::from("/tmp/archivist.db")).expect("Failed to init db")
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
            scan_source,
            analyze_image,
            create_import_plan,
            execute_import,
            import_single_image,
            generate_temp_thumbnail,
            cleanup_temp_thumbnails,
            export_group,
            rescan_archive,
            delete_files,
            save_config,
            load_config,
            path_exists,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}