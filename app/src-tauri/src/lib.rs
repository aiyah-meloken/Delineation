mod a2ui;
mod term;

use crate::term::session::{
    kill as term_kill_inner, resize as term_resize_inner, spawn as term_spawn_inner,
    write as term_write_inner, TermState,
};
use tauri::AppHandle;

#[tauri::command]
async fn term_spawn(
    app: AppHandle,
    project_path: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    term_spawn_inner(app, project_path, cols, rows)
        .await
        .map_err(|e| e.to_string())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(TermState::new())
        .invoke_handler(tauri::generate_handler![
            term_spawn,
            term_write,
            term_resize,
            term_kill
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
