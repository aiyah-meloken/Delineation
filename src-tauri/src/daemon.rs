use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use portable_pty::{native_pty_system, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::{mpsc, Mutex};
use tokio::time::sleep;

use crate::a2ui::parse_a2ui_block;
use crate::control::{
    daemon_dispatch_core, discover_lenskits, ensure_project_layout, store_path, ControlInfo,
    WorkbenchContext,
};
use crate::term::session::{
    apply_common_env, apply_delineation_env, command_for_profile, extract_last_a2ui_block_text,
    strip_ansi, TerminalProfileId, TAIL_CAP,
};

const SOCKET_FILE: &str = ".delineation/runtime/daemon.sock";
const TERMINAL_HISTORY_CAP: usize = 2 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
pub struct DaemonTerminalSession {
    pub id: String,
    pub profile: TerminalProfileId,
    pub title: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum DaemonEvent {
    Data { session_id: String, bytes_b64: String },
    Exit { session_id: String, code: Option<u32> },
    Graph { session_id: String, graph: Value },
    ParseError { session_id: String, msg: String },
}

struct DaemonSession {
    id: String,
    profile: TerminalProfileId,
    title: String,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<StdMutex<Box<dyn std::io::Write + Send>>>,
    child: Arc<StdMutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    subscribers: Arc<StdMutex<Vec<mpsc::UnboundedSender<DaemonEvent>>>>,
    history: Arc<TerminalHistory>,
}

struct DaemonState {
    sessions: Mutex<HashMap<String, Arc<DaemonSession>>>,
    context: Mutex<DaemonWorkbenchContext>,
    workbench_subscribers: StdMutex<Vec<mpsc::UnboundedSender<WorkbenchEvent>>>,
    app_exe: PathBuf,
}

struct DaemonWorkbenchContext {
    project_path: String,
    active_view: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum WorkbenchEvent {
    ViewChanged {
        action: String,
        view_path: String,
    },
    WindowFocus,
}

#[derive(Default)]
pub struct DaemonClientState {
    workbench_bridges: Mutex<HashMap<String, tokio::task::JoinHandle<()>>>,
    terminal_attachments: Mutex<HashMap<String, TerminalAttachment>>,
}

pub struct TerminalAttachment {
    pub project_path: String,
    pub task: tokio::task::JoinHandle<()>,
}

#[derive(Debug, Deserialize)]
struct RpcRequest {
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Deserialize)]
struct AttachParams {
    session_id: String,
    project_path: String,
    profile: TerminalProfileId,
    active_view: Option<String>,
    cols: u16,
    rows: u16,
}

#[derive(Debug, Deserialize)]
struct SessionIdParams {
    session_id: String,
}

#[derive(Debug, Deserialize)]
struct WriteParams {
    session_id: String,
    data: String,
}

#[derive(Debug, Deserialize)]
struct ResizeParams {
    session_id: String,
    cols: u16,
    rows: u16,
}

#[derive(Debug)]
struct TerminalHistory {
    cap: usize,
    bytes: StdMutex<Vec<u8>>,
}

impl TerminalHistory {
    fn new(cap: usize) -> Self {
        Self {
            cap,
            bytes: StdMutex::new(Vec::with_capacity(cap.min(64 * 1024))),
        }
    }

    fn append(&self, chunk: &[u8]) {
        if self.cap == 0 || chunk.is_empty() {
            return;
        }
        if let Ok(mut bytes) = self.bytes.lock() {
            if chunk.len() >= self.cap {
                bytes.clear();
                bytes.extend_from_slice(&chunk[chunk.len() - self.cap..]);
                return;
            }
            bytes.extend_from_slice(chunk);
            if bytes.len() > self.cap {
                let overflow = bytes.len() - self.cap;
                bytes.drain(..overflow);
            }
        }
    }

    fn snapshot(&self) -> Vec<u8> {
        self.bytes
            .lock()
            .map(|bytes| bytes.clone())
            .unwrap_or_default()
    }
}

pub fn socket_path(project_path: &str) -> PathBuf {
    PathBuf::from(project_path).join(SOCKET_FILE)
}

pub async fn ensure_running(project_path: &str) -> Result<()> {
    if daemon_rpc(project_path, "daemon.ping", json!({})).await.is_ok() {
        return Ok(());
    }

    let socket = socket_path(project_path);
    if socket.exists() {
        let _ = std::fs::remove_file(&socket);
    }
    if let Some(parent) = socket.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let app_exe = std::env::current_exe()?;
    let log_path = PathBuf::from(project_path).join(".delineation/runtime/daemon.log");
    let stdout = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)?;
    let stderr = stdout.try_clone()?;

    std::process::Command::new(&app_exe)
        .arg("--delineation-daemon")
        .arg(project_path)
        .arg(app_exe.to_string_lossy().to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .spawn()
        .map_err(|e| anyhow!("failed to start daemon: {e}"))?;

    let mut last_error = None;
    for _ in 0..40 {
        match daemon_rpc(project_path, "daemon.ping", json!({})).await {
            Ok(_) => return Ok(()),
            Err(err) => {
                last_error = Some(err);
                sleep(Duration::from_millis(100)).await;
            }
        }
    }

    Err(anyhow!(
        "daemon did not become ready: {}",
        last_error
            .map(|err| err.to_string())
            .unwrap_or_else(|| "unknown error".to_string())
    ))
}

pub async fn daemon_rpc(project_path: &str, method: &str, params: Value) -> Result<Value> {
    let socket = socket_path(project_path);
    let mut stream = UnixStream::connect(&socket)
        .await
        .map_err(|e| anyhow!("connect daemon socket {} failed: {e}", socket.display()))?;
    let request = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params
    });
    stream.write_all(serde_json::to_string(&request)?.as_bytes()).await?;
    stream.write_all(b"\n").await?;
    stream.flush().await?;

    let mut reader = BufReader::new(stream);
    let mut response = String::new();
    reader.read_line(&mut response).await?;
    let value: Value = serde_json::from_str(&response)?;
    if let Some(error) = value.get("error") {
        return Err(anyhow!(
            "{}",
            error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("daemon rpc failed")
        ));
    }
    Ok(value.get("result").cloned().unwrap_or(Value::Null))
}

pub async fn start_workbench_bridge(app: AppHandle, project_path: String) -> Result<ControlInfo> {
    ensure_project_layout(&project_path)?;
    ensure_running(&project_path).await?;

    let info = ControlInfo {
        socket_path: socket_path(&project_path).to_string_lossy().to_string(),
        store_path: store_path(&project_path).to_string_lossy().to_string(),
    };

    let state = app.state::<DaemonClientState>();
    let mut bridges = state.workbench_bridges.lock().await;
    if bridges.contains_key(&project_path) {
        return Ok(info);
    }

    let app_for_task = app.clone();
    let project_for_task = project_path.clone();
    let task = tokio::spawn(async move {
        if let Err(err) = subscribe_workbench_events(app_for_task, project_for_task).await {
            eprintln!("daemon workbench subscription ended: {err}");
        }
    });
    bridges.insert(project_path, task);
    Ok(info)
}

async fn subscribe_workbench_events(app: AppHandle, project_path: String) -> Result<()> {
    let socket = socket_path(&project_path);
    let mut stream = UnixStream::connect(&socket).await?;
    let request = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "workbench.subscribe",
        "params": {}
    });
    stream.write_all(serde_json::to_string(&request)?.as_bytes()).await?;
    stream.write_all(b"\n").await?;
    stream.flush().await?;

    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).await?;
    let response: Value = serde_json::from_str(&line)?;
    if response.get("error").is_some() {
        return Err(anyhow!("workbench subscribe failed: {response}"));
    }

    loop {
        line.clear();
        if reader.read_line(&mut line).await? == 0 {
            break;
        }
        let value: Value = serde_json::from_str(&line)?;
        let Some(event) = value.get("event") else {
            continue;
        };
        match event.get("type").and_then(Value::as_str) {
            Some("view-changed") => {
                let action = event
                    .get("action")
                    .and_then(Value::as_str)
                    .unwrap_or("update");
                let view_path = event
                    .get("view_path")
                    .or_else(|| event.get("viewPath"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                app.emit(
                    "control://view-changed",
                    json!({ "action": action, "viewPath": view_path }),
                )?;
            }
            Some("window-focus") => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        }
    }

    Ok(())
}

pub async fn set_workbench_context(
    project_path: Option<String>,
    active_view: Option<String>,
) -> Result<()> {
    if let Some(project_path) = project_path {
        ensure_running(&project_path).await?;
        daemon_rpc(
            &project_path,
            "workbench.context.set",
            json!({ "activeView": active_view }),
        )
        .await?;
    }
    Ok(())
}

pub async fn attach_terminal(
    app: AppHandle,
    session_id: String,
    project_path: String,
    profile: TerminalProfileId,
    active_view: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<String> {
    ensure_running(&project_path).await?;

    let state = app.state::<DaemonClientState>();
    if let Some(previous) = state.terminal_attachments.lock().await.remove(&session_id) {
        previous.task.abort();
    }

    let socket = socket_path(&project_path);
    let mut stream = UnixStream::connect(&socket).await?;
    let request = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "terminal.attach",
        "params": {
            "session_id": session_id,
            "project_path": project_path,
            "profile": profile,
            "active_view": active_view,
            "cols": cols,
            "rows": rows
        }
    });
    stream.write_all(serde_json::to_string(&request)?.as_bytes()).await?;
    stream.write_all(b"\n").await?;
    stream.flush().await?;

    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).await?;
    let response: Value = serde_json::from_str(&line)?;
    if let Some(error) = response.get("error") {
        return Err(anyhow!(
            "{}",
            error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("terminal attach failed")
        ));
    }

    let sid = response
        .get("result")
        .and_then(|result| result.get("session_id"))
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("terminal attach response missing session_id"))?
        .to_string();

    let app_for_task = app.clone();
    let sid_for_task = sid.clone();
    let task = tokio::spawn(async move {
        if let Err(err) = forward_terminal_events(app_for_task, sid_for_task, reader).await {
            eprintln!("terminal event bridge ended: {err}");
        }
    });

    state.terminal_attachments.lock().await.insert(
        sid.clone(),
        TerminalAttachment {
            project_path,
            task,
        },
    );

    Ok(sid)
}

async fn forward_terminal_events(
    app: AppHandle,
    session_id: String,
    mut reader: BufReader<UnixStream>,
) -> Result<()> {
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line).await? == 0 {
            break;
        }
        let value: Value = serde_json::from_str(&line)?;
        let Some(event) = value.get("event") else {
            continue;
        };
        match event.get("type").and_then(Value::as_str) {
            Some("data") => {
                let bytes_b64 = event
                    .get("bytes_b64")
                    .or_else(|| event.get("bytesB64"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                app.emit(
                    "term://data",
                    json!({ "session_id": session_id, "bytes_b64": bytes_b64 }),
                )?;
            }
            Some("exit") => {
                let code = event.get("code").and_then(Value::as_u64);
                app.emit(
                    "term://exit",
                    json!({ "session_id": session_id, "code": code }),
                )?;
                break;
            }
            Some("graph") => {
                if let Some(graph) = event.get("graph") {
                    app.emit(
                        "a2ui://graph",
                        json!({ "session_id": session_id, "graph": graph }),
                    )?;
                }
            }
            Some("parse-error") => {
                let msg = event.get("msg").and_then(Value::as_str).unwrap_or("");
                app.emit(
                    "term://parse-error",
                    json!({ "session_id": session_id, "msg": msg }),
                )?;
            }
            _ => {}
        }
    }
    Ok(())
}

pub async fn terminal_write(project_path: String, session_id: String, data: String) -> Result<()> {
    ensure_running(&project_path).await?;
    daemon_rpc(
        &project_path,
        "terminal.write",
        json!({ "session_id": session_id, "data": data }),
    )
    .await?;
    Ok(())
}

pub async fn terminal_resize(
    project_path: String,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<()> {
    ensure_running(&project_path).await?;
    daemon_rpc(
        &project_path,
        "terminal.resize",
        json!({ "session_id": session_id, "cols": cols, "rows": rows }),
    )
    .await?;
    Ok(())
}

pub async fn terminal_kill(project_path: String, session_id: String) -> Result<()> {
    ensure_running(&project_path).await?;
    daemon_rpc(
        &project_path,
        "terminal.kill",
        json!({ "session_id": session_id }),
    )
    .await?;
    Ok(())
}

pub async fn terminal_detach(app: AppHandle, session_id: String) -> Result<()> {
    let state = app.state::<DaemonClientState>();
    if let Some(attachment) = state.terminal_attachments.lock().await.remove(&session_id) {
        attachment.task.abort();
    }
    Ok(())
}

impl DaemonClientState {
    pub fn new() -> Self {
        Self::default()
    }
}

pub fn run(project_path: String, app_exe: PathBuf) -> Result<()> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    runtime.block_on(run_async(project_path, app_exe))
}

async fn run_async(project_path: String, app_exe: PathBuf) -> Result<()> {
    ensure_project_layout(&project_path)?;
    let socket = socket_path(&project_path);
    if let Some(parent) = socket.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if socket.exists() {
        let _ = std::fs::remove_file(&socket);
    }

    let listener = UnixListener::bind(&socket)
        .map_err(|e| anyhow!("bind daemon socket {} failed: {e}", socket.display()))?;
    let state = Arc::new(DaemonState {
        sessions: Mutex::new(HashMap::new()),
        context: Mutex::new(DaemonWorkbenchContext {
            project_path: project_path.clone(),
            active_view: None,
        }),
        workbench_subscribers: StdMutex::new(Vec::new()),
        app_exe,
    });

    loop {
        let (stream, _) = listener.accept().await?;
        let state = Arc::clone(&state);
        let project_path = project_path.clone();
        tokio::spawn(async move {
            let _ = handle_connection(state, project_path, stream).await;
        });
    }
}

async fn handle_connection(
    state: Arc<DaemonState>,
    daemon_project_path: String,
    stream: UnixStream,
) -> Result<()> {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    if reader.read_line(&mut line).await? == 0 {
        return Ok(());
    }
    let request: RpcRequest = serde_json::from_str(&line)?;
    if request.method == "terminal.attach" {
        handle_attach(state, daemon_project_path, reader, request).await
    } else if request.method == "workbench.subscribe" {
        handle_workbench_subscribe(state, reader, request).await
    } else {
        let id = request.id.clone();
        let result = dispatch_request(state, request).await;
        let mut stream = reader.into_inner();
        write_rpc_result(&mut stream, id, result).await
    }
}

async fn handle_workbench_subscribe(
    state: Arc<DaemonState>,
    reader: BufReader<UnixStream>,
    request: RpcRequest,
) -> Result<()> {
    let (tx, mut rx) = mpsc::unbounded_channel::<WorkbenchEvent>();
    {
        let mut subscribers = state
            .workbench_subscribers
            .lock()
            .map_err(|e| anyhow!("workbench subscriber lock poisoned: {e}"))?;
        subscribers.push(tx);
    }

    let mut stream = reader.into_inner();
    write_rpc_result(&mut stream, request.id.clone(), Ok(json!({ "subscribed": true }))).await?;

    while let Some(event) = rx.recv().await {
        let payload = serde_json::to_string(&json!({ "event": event }))?;
        if stream.write_all(payload.as_bytes()).await.is_err() {
            break;
        }
        if stream.write_all(b"\n").await.is_err() {
            break;
        }
    }

    Ok(())
}

async fn handle_attach(
    state: Arc<DaemonState>,
    daemon_project_path: String,
    reader: BufReader<UnixStream>,
    request: RpcRequest,
) -> Result<()> {
    let id = request.id.clone();
    let params: AttachParams = serde_json::from_value(request.params)?;
    if params.project_path != daemon_project_path {
        let mut stream = reader.into_inner();
        return write_rpc_result(
            &mut stream,
            id,
            Err(anyhow!("daemon is bound to a different project")),
        )
        .await;
    }

    let session = ensure_session(Arc::clone(&state), params).await?;
    let (tx, mut rx) = mpsc::unbounded_channel::<DaemonEvent>();
    let replay_tx = tx.clone();
    {
        let mut subscribers = session
            .subscribers
            .lock()
            .map_err(|e| anyhow!("subscriber lock poisoned: {e}"))?;
        subscribers.push(tx);
    }
    let replay = session.history.snapshot();
    if !replay.is_empty() {
        let _ = replay_tx.send(DaemonEvent::Data {
            session_id: session.id.clone(),
            bytes_b64: B64.encode(replay),
        });
    }

    let mut stream = reader.into_inner();
    write_rpc_result(
        &mut stream,
        id,
        Ok(json!({ "session_id": session.id, "title": session.title })),
    )
    .await?;

    while let Some(event) = rx.recv().await {
        let payload = serde_json::to_string(&json!({ "event": event }))?;
        if stream.write_all(payload.as_bytes()).await.is_err() {
            break;
        }
        if stream.write_all(b"\n").await.is_err() {
            break;
        }
    }

    Ok(())
}

async fn dispatch_request(state: Arc<DaemonState>, request: RpcRequest) -> Result<Value> {
    match request.method.as_str() {
        "daemon.ping" => Ok(json!({ "ok": true })),
        "workbench.context.set" => {
            let active_view = request
                .params
                .get("activeView")
                .and_then(Value::as_str)
                .map(|value| value.to_string());
            let mut context = state.context.lock().await;
            context.active_view = active_view;
            Ok(json!({ "ok": true }))
        }
        "workbench.context.get" => {
            let context = state.context.lock().await;
            Ok(json!(WorkbenchContext {
                project_path: Some(context.project_path.clone()),
                store_path: Some(store_path(&context.project_path).to_string_lossy().to_string()),
                socket_path: Some(socket_path(&context.project_path).to_string_lossy().to_string()),
                active_view: context.active_view.clone(),
                lenskits: discover_lenskits(&context.project_path).unwrap_or_default(),
            }))
        }
        "workbench.window.open" | "workbench.window.focus" => {
            broadcast_workbench(&state, WorkbenchEvent::WindowFocus);
            if subscriber_count(&state) == 0 {
                let _ = std::process::Command::new(&state.app_exe).spawn();
            }
            Ok(json!({ "window": "main", "focused": true }))
        }
        "lenskit.list"
        | "view.create"
        | "view.updateA2UI"
        | "view.updateStatus"
        | "view.open"
        | "view.focus"
        | "view.version.list"
        | "view.version.get" => {
            let context = state.context.lock().await;
            let (result, event) = daemon_dispatch_core(
                &context.project_path,
                socket_path(&context.project_path).to_string_lossy().to_string(),
                context.active_view.clone(),
                request.method.as_str(),
                request.params,
            )?;
            drop(context);
            if let Some(event) = event {
                broadcast_workbench(&state, event);
            }
            Ok(result)
        }
        "terminal.list" => {
            let sessions = state.sessions.lock().await;
            let result: Vec<DaemonTerminalSession> = sessions
                .values()
                .map(|session| DaemonTerminalSession {
                    id: session.id.clone(),
                    profile: session.profile.clone(),
                    title: session.title.clone(),
                })
                .collect();
            Ok(json!(result))
        }
        "terminal.write" => {
            let params: WriteParams = serde_json::from_value(request.params)?;
            let bytes = B64
                .decode(params.data)
                .map_err(|e| anyhow!("base64 decode failed: {e}"))?;
            let session = session_by_id(&state, &params.session_id).await?;
            let mut writer = session
                .writer
                .lock()
                .map_err(|e| anyhow!("writer lock poisoned: {e}"))?;
            use std::io::Write;
            writer.write_all(&bytes)?;
            writer.flush()?;
            Ok(json!(true))
        }
        "terminal.resize" => {
            let params: ResizeParams = serde_json::from_value(request.params)?;
            let session = session_by_id(&state, &params.session_id).await?;
            let master = session.master.lock().await;
            master.resize(PtySize {
                rows: sanitize_rows(params.rows),
                cols: sanitize_cols(params.cols),
                pixel_width: 0,
                pixel_height: 0,
            })?;
            Ok(json!(true))
        }
        "terminal.kill" => {
            let params: SessionIdParams = serde_json::from_value(request.params)?;
            let mut sessions = state.sessions.lock().await;
            if let Some(session) = sessions.remove(&params.session_id) {
                if let Ok(mut child) = session.child.lock() {
                    let _ = child.kill();
                }
            }
            Ok(json!(true))
        }
        _ => Err(anyhow!("unknown daemon method: {}", request.method)),
    }
}

fn broadcast_workbench(state: &DaemonState, event: WorkbenchEvent) {
    if let Ok(mut subscribers) = state.workbench_subscribers.lock() {
        subscribers.retain(|subscriber| subscriber.send(event.clone()).is_ok());
    }
}

fn subscriber_count(state: &DaemonState) -> usize {
    state
        .workbench_subscribers
        .lock()
        .map(|subscribers| subscribers.len())
        .unwrap_or(0)
}

async fn write_rpc_result(stream: &mut UnixStream, id: Option<Value>, result: Result<Value>) -> Result<()> {
    let payload = match result {
        Ok(value) => json!({ "jsonrpc": "2.0", "id": id, "result": value }),
        Err(err) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": -32000, "message": err.to_string() }
        }),
    };
    let line = serde_json::to_string(&payload)?;
    stream.write_all(line.as_bytes()).await?;
    stream.write_all(b"\n").await?;
    stream.flush().await?;
    Ok(())
}

async fn session_by_id(state: &DaemonState, session_id: &str) -> Result<Arc<DaemonSession>> {
    let sessions = state.sessions.lock().await;
    sessions
        .get(session_id)
        .cloned()
        .ok_or_else(|| anyhow!("terminal session not found: {session_id}"))
}

async fn ensure_session(
    state: Arc<DaemonState>,
    params: AttachParams,
) -> Result<Arc<DaemonSession>> {
    {
        let sessions = state.sessions.lock().await;
        if let Some(session) = sessions.get(&params.session_id) {
            return Ok(Arc::clone(session));
        }
    }

    let session = spawn_session(Arc::clone(&state), params)?;
    let mut sessions = state.sessions.lock().await;
    sessions.insert(session.id.clone(), Arc::clone(&session));
    Ok(session)
}

fn spawn_session(state: Arc<DaemonState>, params: AttachParams) -> Result<Arc<DaemonSession>> {
    let cols = sanitize_cols(params.cols);
    let rows = sanitize_rows(params.rows);

    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    ensure_project_layout(&params.project_path)?;
    let mut cmd = command_for_profile(params.profile.clone(), &params.project_path);
    cmd.cwd(&params.project_path);
    apply_common_env(&mut cmd);
    apply_delineation_env(&mut cmd, &params.project_path, params.active_view.as_deref());

    let child = pair.slave.spawn_command(cmd)?;
    drop(pair.slave);

    let reader = pair.master.try_clone_reader()?;
    let writer = pair.master.take_writer()?;
    let history = Arc::new(TerminalHistory::new(TERMINAL_HISTORY_CAP));
    let session = Arc::new(DaemonSession {
        id: params.session_id.clone(),
        title: profile_title(&params.profile),
        profile: params.profile,
        master: Arc::new(Mutex::new(pair.master)),
        writer: Arc::new(StdMutex::new(writer)),
        child: Arc::new(StdMutex::new(child)),
        subscribers: Arc::new(StdMutex::new(Vec::new())),
        history: Arc::clone(&history),
    });

    start_reader_thread(
        Arc::clone(&state),
        session.id.clone(),
        Arc::clone(&session.child),
        Arc::clone(&session.subscribers),
        history,
        reader,
    );

    Ok(session)
}

fn start_reader_thread(
    state: Arc<DaemonState>,
    session_id: String,
    child: Arc<StdMutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    subscribers: Arc<StdMutex<Vec<mpsc::UnboundedSender<DaemonEvent>>>>,
    history: Arc<TerminalHistory>,
    mut reader: Box<dyn std::io::Read + Send>,
) {
    let runtime = tokio::runtime::Handle::current();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut tail: Vec<u8> = Vec::with_capacity(TAIL_CAP);
        let mut line_accumulator: Vec<u8> = Vec::new();
        let mut last_emitted_block = String::new();

        loop {
            match std::io::Read::read(&mut reader, &mut buf) {
                Ok(0) | Err(_) => {
                    let exit_code = child
                        .lock()
                        .ok()
                        .and_then(|mut c| c.wait().ok())
                        .map(|status| status.exit_code());
                    broadcast(
                        &subscribers,
                        DaemonEvent::Exit {
                            session_id: session_id.clone(),
                            code: exit_code,
                        },
                    );
                    let state = Arc::clone(&state);
                    let sid = session_id.clone();
                    runtime.spawn(async move {
                        let mut sessions = state.sessions.lock().await;
                        sessions.remove(&sid);
                    });
                    break;
                }
                Ok(n) => {
                    let chunk = &buf[..n];
                    history.append(chunk);
                    broadcast(
                        &subscribers,
                        DaemonEvent::Data {
                            session_id: session_id.clone(),
                            bytes_b64: B64.encode(chunk),
                        },
                    );

                    tail.extend_from_slice(chunk);
                    if tail.len() > TAIL_CAP {
                        let overflow = tail.len() - TAIL_CAP;
                        tail.drain(..overflow);
                    }
                    line_accumulator.extend_from_slice(chunk);
                    if line_accumulator.contains(&b'\n') {
                        line_accumulator.clear();
                        let tail_str = String::from_utf8_lossy(&tail).to_string();
                        let clean = strip_ansi(&tail_str);
                        if clean.contains("```a2ui") && clean.contains("```") {
                            match parse_a2ui_block(&clean) {
                                Ok(Some(graph)) => {
                                    let block_text = extract_last_a2ui_block_text(&clean);
                                    if block_text != last_emitted_block {
                                        last_emitted_block = block_text;
                                        if let Ok(graph) = serde_json::to_value(graph) {
                                            broadcast(
                                                &subscribers,
                                                DaemonEvent::Graph {
                                                    session_id: session_id.clone(),
                                                    graph,
                                                },
                                            );
                                        }
                                    }
                                }
                                Ok(None) => {}
                                Err(e) => broadcast(
                                    &subscribers,
                                    DaemonEvent::ParseError {
                                        session_id: session_id.clone(),
                                        msg: e.to_string(),
                                    },
                                ),
                            }
                        }
                    }
                }
            }
        }
    });
}

fn broadcast(
    subscribers: &StdMutex<Vec<mpsc::UnboundedSender<DaemonEvent>>>,
    event: DaemonEvent,
) {
    if let Ok(mut subscribers) = subscribers.lock() {
        subscribers.retain(|subscriber| subscriber.send(event.clone()).is_ok());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_history_keeps_recent_bytes_with_byte_cap() {
        let history = TerminalHistory::new(10);

        history.append(b"hello");
        history.append(b" world");

        assert_eq!(history.snapshot(), b"ello world");
    }
}

fn profile_title(profile: &TerminalProfileId) -> String {
    match profile {
        TerminalProfileId::Shell => std::env::var("SHELL")
            .ok()
            .and_then(|shell| {
                std::path::Path::new(&shell)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.to_string())
            })
            .unwrap_or_else(|| "shell".to_string()),
        TerminalProfileId::Claude => "Claude Code".to_string(),
        TerminalProfileId::Codex => "Codex".to_string(),
    }
}

fn sanitize_cols(cols: u16) -> u16 {
    if cols < 2 { 80 } else { cols }
}

fn sanitize_rows(rows: u16) -> u16 {
    if rows < 2 { 24 } else { rows }
}
