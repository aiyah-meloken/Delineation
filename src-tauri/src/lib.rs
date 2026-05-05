mod a2ui;
mod control;
pub mod daemon;
mod term;

use crate::control::{
    discover_lenskits, list_versions_for_view, set_context as control_set_context_inner,
    store_path as control_store_path, ControlInfo, ControlState, LensKitInfo, ViewVersionInfo,
};
use crate::daemon::{
    attach_terminal, set_workbench_context, start_workbench_bridge, terminal_detach,
    terminal_kill, terminal_resize, terminal_write, DaemonClientState,
};
use crate::term::session::{
    available_profiles as term_available_profiles_inner, TerminalProfile, TerminalProfileId,
};
use tauri::{AppHandle, Manager};

#[tauri::command]
async fn term_spawn(
    app: AppHandle,
    session_id: String,
    project_path: String,
    profile: TerminalProfileId,
    active_view: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    attach_terminal(app, session_id, project_path, profile, active_view, cols, rows)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn term_available_profiles() -> Result<Vec<TerminalProfile>, String> {
    Ok(term_available_profiles_inner())
}

#[tauri::command]
async fn term_write(project_path: String, session_id: String, data: String) -> Result<(), String> {
    terminal_write(project_path, session_id, data)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn term_resize(
    project_path: String,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    terminal_resize(project_path, session_id, cols, rows)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn term_kill(project_path: String, session_id: String) -> Result<(), String> {
    terminal_kill(project_path, session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn term_detach(app: AppHandle, session_id: String) -> Result<(), String> {
    terminal_detach(app, session_id)
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
    start_workbench_bridge(app, project_path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn control_set_context(
    app: AppHandle,
    project_path: Option<String>,
    active_view: Option<String>,
) -> Result<(), String> {
    let app_project_path = project_path.clone();
    control_set_context_inner(app, project_path, active_view.clone())
        .await
        .map_err(|e| e.to_string())?;
    set_workbench_context(app_project_path, active_view)
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
        socket_path: crate::daemon::socket_path(&project_path)
            .to_string_lossy()
            .to_string(),
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
        .manage(ControlState::new())
        .manage(DaemonClientState::new())
        .invoke_handler(tauri::generate_handler![
            term_spawn,
            term_available_profiles,
            term_write,
            term_resize,
            term_kill,
            term_detach,
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
