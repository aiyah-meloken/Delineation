mod a2ui;
mod control;
mod term;

use crate::control::{
    discover_lenskits, list_versions_for_view, set_context as control_set_context_inner,
    start as control_start_inner, store_path as control_store_path,
    socket_path as control_socket_path, ControlInfo, ControlState, LensKitInfo, ViewVersionInfo,
};
use crate::term::session::{
    available_profiles as term_available_profiles_inner, kill as term_kill_inner,
    resize as term_resize_inner, spawn as term_spawn_inner, write as term_write_inner,
    TermState, TerminalProfile, TerminalProfileId,
};
use tauri::{AppHandle, Manager};

#[tauri::command]
async fn term_spawn(
    app: AppHandle,
    project_path: String,
    profile: TerminalProfileId,
    active_view: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    term_spawn_inner(app, project_path, profile, active_view, cols, rows)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn term_available_profiles() -> Result<Vec<TerminalProfile>, String> {
    Ok(term_available_profiles_inner())
}

#[tauri::command]
async fn term_write(app: AppHandle, session_id: String, data: String) -> Result<(), String> {
    term_write_inner(app, session_id, data)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn term_resize(
    app: AppHandle,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    term_resize_inner(app, session_id, cols, rows)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn term_kill(app: AppHandle, session_id: String) -> Result<(), String> {
    term_kill_inner(app, session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_inspector(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window.open_devtools();
    Ok(())
}

#[tauri::command]
async fn control_start(app: AppHandle, project_path: String) -> Result<ControlInfo, String> {
    control_start_inner(app, project_path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn control_set_context(
    app: AppHandle,
    project_path: Option<String>,
    active_view: Option<String>,
) -> Result<(), String> {
    control_set_context_inner(app, project_path, active_view)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn control_list_view_versions(
    project_path: String,
    view_path: String,
) -> Result<Vec<ViewVersionInfo>, String> {
    list_versions_for_view(&project_path, &view_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn control_get_view_version(
    project_path: String,
    view_path: String,
    version_id: String,
) -> Result<String, String> {
    let path = control_store_path(&project_path)
        .join("versions/views")
        .join(view_path.replace('/', "__").replace('\\', "__"))
        .join(format!("{version_id}.json"));
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn control_info(project_path: String) -> Result<ControlInfo, String> {
    Ok(ControlInfo {
        socket_path: control_socket_path(&project_path).to_string_lossy().to_string(),
        store_path: control_store_path(&project_path).to_string_lossy().to_string(),
    })
}

#[tauri::command]
async fn control_list_lenskits(project_path: String) -> Result<Vec<LensKitInfo>, String> {
    discover_lenskits(&project_path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(TermState::new())
        .manage(ControlState::new())
        .invoke_handler(tauri::generate_handler![
            term_spawn,
            term_available_profiles,
            term_write,
            term_resize,
            term_kill,
            open_inspector,
            control_start,
            control_set_context,
            control_list_view_versions,
            control_get_view_version,
            control_info,
            control_list_lenskits
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
