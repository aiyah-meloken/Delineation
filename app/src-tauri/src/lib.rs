mod a2ui;
mod acp;

use crate::acp::client::{cancel as acp_cancel_inner, send_prompt as acp_send_prompt_inner,
    start_session as acp_start_session_inner, AcpState};
use tauri::{AppHandle, Manager};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn acp_start_session(app: AppHandle, project_path: String) -> Result<String, String> {
    acp_start_session_inner(app, project_path).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn acp_send_prompt(app: AppHandle, session_id: String, text: String) -> Result<(), String> {
    acp_send_prompt_inner(app, session_id, text).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn acp_cancel(app: AppHandle, session_id: String) -> Result<(), String> {
    acp_cancel_inner(app, session_id).await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AcpState::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            acp_start_session,
            acp_send_prompt,
            acp_cancel
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
