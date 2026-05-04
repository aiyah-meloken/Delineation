mod a2ui;
mod term;

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
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    term_spawn_inner(app, project_path, profile, cols, rows)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(TermState::new())
        .invoke_handler(tauri::generate_handler![
            term_spawn,
            term_available_profiles,
            term_write,
            term_resize,
            term_kill,
            open_inspector
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
