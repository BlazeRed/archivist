pub mod db;
pub mod error;
pub mod state;

use std::sync::Arc;
use tauri::Manager;
use state::AppState;

fn get_db_path(archive_path: &str) -> std::path::PathBuf {
    std::path::Path::new(archive_path)
        .join(".archivist")
        .join("archivist.db")
}

#[tauri::command]
fn init_archive(state: tauri::State<'_, Arc<AppState>>, archive_path: String) -> Result<(), error::AppError> {
    state.set_archive_path(archive_path.clone());
    let db_path = get_db_path(&archive_path);
    let new_state = AppState::new(db_path)?;
    let new_db = Arc::new(new_state.db);
    
    // Replace the database in state - we need to restructure this
    // For now, just return success and we'll manage db path in commands
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}