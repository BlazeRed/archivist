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
    state.set_archive_path(archive_path);
    Ok(())
}

#[tauri::command]
fn get_image_count(state: tauri::State<'_, Arc<AppState>>) -> Result<i64, error::AppError> {
    state.db.get_image_count()
}

#[tauri::command]
fn get_all_images(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<db::image::Image>, error::AppError> {
    state.db.get_all_images()
}

#[tauri::command]
fn get_images_by_date(state: tauri::State<'_, Arc<AppState>>, year: i32, month: Option<i32>) -> Result<Vec<db::image::Image>, error::AppError> {
    state.db.get_images_by_date(year, month)
}

#[tauri::command]
fn get_all_groups(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<db::group::GroupWithCount>, error::AppError> {
    state.db.get_all_groups()
}

#[tauri::command]
fn create_group(state: tauri::State<'_, Arc<AppState>>, name: String) -> Result<i64, error::AppError> {
    state.db.create_group(&name)
}

#[tauri::command]
fn delete_group(state: tauri::State<'_, Arc<AppState>>, id: i64) -> Result<(), error::AppError> {
    state.db.delete_group(id)
}

#[tauri::command]
fn add_image_to_group(state: tauri::State<'_, Arc<AppState>>, image_id: String, group_id: i64) -> Result<(), error::AppError> {
    state.db.add_image_to_group(&image_id, group_id)
}

#[tauri::command]
fn remove_image_from_group(state: tauri::State<'_, Arc<AppState>>, image_id: String, group_id: i64) -> Result<(), error::AppError> {
    state.db.remove_image_from_group(&image_id, group_id)
}

#[tauri::command]
fn get_images_in_group(state: tauri::State<'_, Arc<AppState>>, group_id: i64) -> Result<Vec<String>, error::AppError> {
    state.db.get_images_in_group(group_id)
}

#[tauri::command]
fn get_groups_for_image(state: tauri::State<'_, Arc<AppState>>, image_id: String) -> Result<Vec<i64>, error::AppError> {
    state.db.get_groups_for_image(&image_id)
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
fn create_import_plan(images: Vec<commands::AnalyzedImage>) -> commands::ImportPlan {
    commands::create_import_plan(images)
}

#[tauri::command]
fn execute_import(
    state: tauri::State<'_, Arc<AppState>>,
    plan: commands::ImportPlan,
    resolutions: Vec<commands::ImportResolution>,
    archive_path: String,
) -> Result<commands::ImportResult, error::AppError> {
    commands::execute_import(plan, resolutions, &archive_path, &state.db)
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
    commands::export_group(&state.db, group_id, &dest_path, &archive_path)
}

#[tauri::command]
fn rescan_archive(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<usize, error::AppError> {
    let archive_path = state.get_archive_path().ok_or_else(|| error::AppError::ArchiveNotFound {
        path: "No archive path set".to_string(),
    })?;
    commands::rescan_archive(&archive_path, &state.db)
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
            scan_source,
            analyze_image,
            create_import_plan,
            execute_import,
            export_group,
            rescan_archive,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}