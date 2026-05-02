use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use regex::Regex;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::a2ui::parse_a2ui_block;
use crate::term::prompts::SYSTEM_PROMPT;

const TAIL_CAP: usize = 256 * 1024;

pub struct SessionHandle {
    /// Master side of the PTY — used for resizing.
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    /// PTY-side writer for stdin.
    writer: Arc<std::sync::Mutex<Box<dyn std::io::Write + Send>>>,
    /// Child process handle.
    child: Arc<std::sync::Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
}

#[derive(Default)]
pub struct TermState {
    pub sessions: Mutex<HashMap<String, Arc<SessionHandle>>>,
}

impl TermState {
    pub fn new() -> Self {
        Self::default()
    }
}

fn strip_ansi(s: &str) -> String {
    let re = Regex::new(r"\x1b\[[0-9;?]*[ -/]*[@-~]").unwrap();
    let osc = Regex::new(r"\x1b\][^\x07]*\x07").unwrap();
    let s = re.replace_all(s, "");
    osc.replace_all(&s, "").to_string()
}

pub async fn spawn(app: AppHandle, project_path: String) -> Result<String> {
    let session_id = Uuid::new_v4().to_string();

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| anyhow!("openpty failed: {e}"))?;

    let mut cmd = CommandBuilder::new("claude");
    cmd.arg("--append-system-prompt");
    cmd.arg(SYSTEM_PROMPT);
    cmd.cwd(&project_path);

    // Ensure PATH is inherited so `claude` resolves from ~/.local/bin or wherever it's installed.
    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", path);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| anyhow!("spawn_command failed: {e}"))?;

    // Drop the slave after spawning — child holds its own reference.
    drop(pair.slave);

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| anyhow!("try_clone_reader failed: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| anyhow!("take_writer failed: {e}"))?;

    let master = Arc::new(Mutex::new(pair.master));
    let writer = Arc::new(std::sync::Mutex::new(writer));
    let child = Arc::new(std::sync::Mutex::new(child));

    let handle = Arc::new(SessionHandle {
        master: Arc::clone(&master),
        writer: Arc::clone(&writer),
        child: Arc::clone(&child),
    });

    // Register before spawning the reader thread so kill/resize work immediately.
    {
        let state = app.state::<TermState>();
        let mut sessions = state.sessions.lock().await;
        sessions.insert(session_id.clone(), Arc::clone(&handle));
    }

    // Spawn a std::thread for the blocking PTY read loop.
    {
        let app = app.clone();
        let session_id = session_id.clone();
        let child_for_thread = Arc::clone(&child);

        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 4096];
            let mut tail: Vec<u8> = Vec::with_capacity(TAIL_CAP);
            let mut line_accumulator: Vec<u8> = Vec::new();
            let mut last_emitted_block = String::new();

            loop {
                match std::io::Read::read(&mut reader, &mut buf) {
                    Ok(0) | Err(_) => {
                        // EOF or read error — session ended.
                        let exit_code: Option<u32> = child_for_thread
                            .lock()
                            .ok()
                            .and_then(|mut c| c.wait().ok())
                            .map(|status| status.exit_code());

                        let _ = app.emit(
                            "term://exit",
                            json!({ "session_id": session_id, "code": exit_code }),
                        );

                        // Remove from state map.
                        let app_clone = app.clone();
                        let sid = session_id.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = app_clone.state::<TermState>();
                            let mut sessions = state.sessions.lock().await;
                            sessions.remove(&sid);
                        });

                        break;
                    }
                    Ok(n) => {
                        let chunk = &buf[..n];

                        // Emit raw bytes (with ANSI) to the terminal frontend.
                        let bytes_b64 = B64.encode(chunk);
                        let _ = app.emit(
                            "term://data",
                            json!({ "session_id": session_id, "bytes_b64": bytes_b64 }),
                        );

                        // Append to tail buffer (ring, capped at TAIL_CAP).
                        tail.extend_from_slice(chunk);
                        if tail.len() > TAIL_CAP {
                            let overflow = tail.len() - TAIL_CAP;
                            tail.drain(..overflow);
                        }

                        // Accumulate for newline detection.
                        line_accumulator.extend_from_slice(chunk);

                        // Check if we have a newline — if so, scan the tail.
                        if line_accumulator.contains(&b'\n') {
                            line_accumulator.clear();

                            // Strip ANSI from the tail and scan for a2ui blocks.
                            let tail_str = String::from_utf8_lossy(&tail).to_string();
                            let clean = strip_ansi(&tail_str);

                            // Only re-parse if the tail contains a complete a2ui block.
                            if clean.contains("```a2ui") && clean.contains("```") {
                                match parse_a2ui_block(&clean) {
                                    Ok(Some(graph)) => {
                                        // Find the raw block text for dedup.
                                        let block_text = extract_last_a2ui_block_text(&clean);
                                        if block_text != last_emitted_block {
                                            last_emitted_block = block_text;
                                            let _ = app.emit(
                                                "a2ui://graph",
                                                json!({ "session_id": session_id, "graph": graph }),
                                            );
                                        }
                                    }
                                    Ok(None) => {}
                                    Err(e) => {
                                        let _ = app.emit(
                                            "term://parse-error",
                                            json!({ "session_id": session_id, "msg": e.to_string() }),
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    Ok(session_id)
}

/// Extract the text of the last a2ui block for deduplication purposes.
fn extract_last_a2ui_block_text(text: &str) -> String {
    let re = match Regex::new(r"(?s)```a2ui\s*\n(.*?)\n```") {
        Ok(r) => r,
        Err(_) => return String::new(),
    };
    re.captures_iter(text)
        .last()
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_owned())
        .unwrap_or_default()
}

pub async fn write(app: AppHandle, session_id: String, data: String) -> Result<()> {
    let bytes = B64
        .decode(&data)
        .map_err(|e| anyhow!("base64 decode failed: {e}"))?;

    let state = app.state::<TermState>();
    let sessions = state.sessions.lock().await;
    let handle = sessions
        .get(&session_id)
        .ok_or_else(|| anyhow!("session not found: {session_id}"))?;

    let mut writer = handle
        .writer
        .lock()
        .map_err(|e| anyhow!("writer lock poisoned: {e}"))?;

    use std::io::Write;
    writer
        .write_all(&bytes)
        .map_err(|e| anyhow!("write_all failed: {e}"))?;
    writer.flush().map_err(|e| anyhow!("flush failed: {e}"))?;

    Ok(())
}

pub async fn resize(app: AppHandle, session_id: String, cols: u16, rows: u16) -> Result<()> {
    let state = app.state::<TermState>();
    let sessions = state.sessions.lock().await;
    let handle = sessions
        .get(&session_id)
        .ok_or_else(|| anyhow!("session not found: {session_id}"))?;

    let master = handle.master.lock().await;
    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| anyhow!("resize failed: {e}"))?;

    Ok(())
}

pub async fn kill(app: AppHandle, session_id: String) -> Result<()> {
    let state = app.state::<TermState>();
    let mut sessions = state.sessions.lock().await;

    if let Some(handle) = sessions.remove(&session_id) {
        // Attempt to kill the child; ignore errors (may already be dead).
        if let Ok(mut child) = handle.child.lock() {
            let _ = child.kill();
        }
    }

    Ok(())
}
