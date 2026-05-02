use anyhow::{Context, Result, anyhow};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{Mutex, mpsc, oneshot};
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};
use uuid::Uuid;

use agent_client_protocol::{
    ByteStreams, Client, ConnectionTo, Agent,
    schema::{
        ContentBlock, ContentChunk, InitializeRequest, ProtocolVersion, RequestPermissionOutcome,
        RequestPermissionRequest, RequestPermissionResponse, SelectedPermissionOutcome,
        SessionNotification, SessionUpdate,
    },
    util::MatchDispatch,
    on_receive_notification, on_receive_request,
};

use crate::a2ui::parse_a2ui_block;
use crate::acp::prompts::SYSTEM_PROMPT;

// ─── Public constants ─────────────────────────────────────────────────────────

/// Adapter argv. We spawn the Zed-published claude-code-acp adapter via npx.
/// The adapter internally spawns `claude` and exposes ACP over stdio.
/// Pinning the minor version keeps behaviour reproducible across machines.
pub const ADAPTER_ARGV: &[&str] = &["npx", "-y", "@zed-industries/claude-code-acp@0.16"];

// ─── Public event payload types ───────────────────────────────────────────────

/// Emitted as `acp://chunk` whenever the agent produces a text delta.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ChunkEvent {
    pub session_id: String,
    pub delta: String,
}

/// Emitted as `acp://turn-ended` when the agent's turn finishes (success or failure).
#[derive(Debug, Clone, serde::Serialize)]
pub struct TurnEndedEvent {
    pub session_id: String,
    pub success: bool,
    pub parse_error: Option<String>,
}

/// Emitted as `a2ui://graph` when the agent's output contains a valid A2UI graph.
#[derive(Debug, Clone, serde::Serialize)]
pub struct GraphEvent {
    pub session_id: String,
    pub graph: crate::a2ui::A2UIGraph,
}

// ─── Internal message types ────────────────────────────────────────────────────

/// Command sent into the connection task to request a prompt.
struct PromptCommand {
    /// The full prompt text (system prefix already prepended if first prompt).
    text: String,
    /// Channel to receive the accumulated assistant text once the turn is done.
    reply_tx: oneshot::Sender<Result<String>>,
    /// The Tauri session_id string, used to emit per-chunk events.
    session_id: String,
    /// The AppHandle, used to emit per-chunk events.
    app: AppHandle,
}

// ─── Session ──────────────────────────────────────────────────────────────────

/// Per-session state stored in `AcpState`.
struct Session {
    /// Project working directory — used when system-prompt-injecting on first call.
    #[allow(dead_code)]
    project_path: String,
    /// Whether we have sent the first prompt yet. Used for system-prompt injection.
    first_prompt_sent: bool,
    /// Channel for sending prompts into the live connection task.
    prompt_tx: mpsc::Sender<PromptCommand>,
    /// Handle to the background connection task — dropped to cancel it.
    _task: tokio::task::JoinHandle<()>,
}

// ─── AcpState ─────────────────────────────────────────────────────────────────

/// Managed Tauri state that holds all live ACP sessions.
#[derive(Default)]
pub struct AcpState {
    sessions: Mutex<HashMap<String, Arc<Mutex<Session>>>>,
}

impl AcpState {
    pub fn new() -> Self {
        Self::default()
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/// Spawn the adapter subprocess, perform the ACP initialize handshake, and return
/// a UUID session-id that identifies this session for subsequent calls.
///
/// The adapter (`@zed-industries/claude-code-acp`) wraps `claude` and speaks ACP
/// over stdio. We set its cwd to `project_path` so the agent sees the user's project.
pub async fn start_session(app: AppHandle, project_path: String) -> Result<String> {
    let session_id = Uuid::new_v4().to_string();

    // Build the subprocess command.
    let mut cmd = tokio::process::Command::new(ADAPTER_ARGV[0]);
    cmd.args(&ADAPTER_ARGV[1..]);
    cmd.current_dir(&project_path);
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    // Inherit stderr so adapter errors show up in Tauri dev console.
    cmd.stderr(std::process::Stdio::inherit());
    // Don't leave zombie processes on Tauri exit.
    cmd.kill_on_drop(true);

    let mut child = cmd
        .spawn()
        .context("failed to spawn claude-code-acp adapter (is `npx` on PATH?)")?;

    let child_stdin = child
        .stdin
        .take()
        .ok_or_else(|| anyhow!("failed to open child stdin"))?;
    let child_stdout = child
        .stdout
        .take()
        .ok_or_else(|| anyhow!("failed to open child stdout"))?;

    // Channel for sending prompts into the connection loop.
    let (prompt_tx, prompt_rx) = mpsc::channel::<PromptCommand>(4);

    let sid_clone = session_id.clone();

    // Spawn the long-running connection task.
    let task = tokio::spawn(async move {
        // Keep the child alive for the duration of the task.
        let mut _child = child;

        let transport = ByteStreams::new(
            child_stdin.compat_write(),
            child_stdout.compat(),
        );

        let result = Client
            .builder()
            // Auto-approve all permission requests. For an MVP this is intentional;
            // a production version would surface them to the frontend.
            .on_receive_request(
                async move |request: RequestPermissionRequest, responder, _cx| {
                    let option_id = request.options.first().map(|opt| opt.option_id.clone());
                    if let Some(id) = option_id {
                        responder.respond(RequestPermissionResponse::new(
                            RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(id)),
                        ))
                    } else {
                        responder.respond(RequestPermissionResponse::new(
                            RequestPermissionOutcome::Cancelled,
                        ))
                    }
                },
                on_receive_request!(),
            )
            // Ignore unsolicited session/update notifications at the connection level;
            // the session-level pump (ActiveSession::read_update) handles them.
            .on_receive_notification(
                async move |_notif: SessionNotification, _cx| Ok(()),
                on_receive_notification!(),
            )
            .connect_with(
                transport,
                |cx: ConnectionTo<Agent>| {
                    // Move prompt_rx into the connection closure.
                    let mut prompt_rx = prompt_rx;
                    let session_id = sid_clone;
                    async move {
                        // Step 1: Initialize.
                        cx.send_request(InitializeRequest::new(ProtocolVersion::V1))
                            .block_task()
                            .await?;

                        // Step 2: Create ACP session with the project cwd.
                        let mut active_session = cx
                            .build_session_cwd()?
                            .block_task()
                            .start_session()
                            .await?;

                        // Step 3: Pump prompt commands from the channel.
                        while let Some(cmd) = prompt_rx.recv().await {
                            let PromptCommand {
                                text,
                                reply_tx,
                                session_id: _,
                                app,
                            } = cmd;

                            // Send the prompt (queues the request; response arrives via read_update).
                            if let Err(e) = active_session.send_prompt(&text) {
                                let _ = reply_tx.send(Err(anyhow!("send_prompt error: {e}")));
                                continue;
                            }

                            // Collect the streaming reply.
                            let mut accumulated = String::new();
                            loop {
                                match active_session.read_update().await {
                                    Err(e) => {
                                        let _ = reply_tx
                                            .send(Err(anyhow!("read_update error: {e}")));
                                        break;
                                    }
                                    Ok(agent_client_protocol::SessionMessage::StopReason(_)) => {
                                        // Turn complete.
                                        let _ = reply_tx.send(Ok(accumulated));
                                        break;
                                    }
                                    Ok(agent_client_protocol::SessionMessage::SessionMessage(
                                        dispatch,
                                    )) => {
                                        // Extract assistant text chunk, if any.
                                        let mut delta_opt: Option<String> = None;

                                        MatchDispatch::new(dispatch)
                                            .if_notification(
                                                async |notif: SessionNotification| {
                                                    if let SessionUpdate::AgentMessageChunk(
                                                        ContentChunk {
                                                            content:
                                                                ContentBlock::Text(text_content),
                                                            ..
                                                        },
                                                    ) = notif.update
                                                    {
                                                        delta_opt =
                                                            Some(text_content.text.clone());
                                                    }
                                                    Ok(())
                                                },
                                            )
                                            .await
                                            .otherwise_ignore()
                                            // Swallow errors from unknown message variants;
                                            // the important path is StopReason.
                                            .unwrap_or(());

                                        if let Some(delta) = delta_opt {
                                            accumulated.push_str(&delta);
                                            // Emit chunk event to frontend.
                                            let _ = app.emit(
                                                "acp://chunk",
                                                ChunkEvent {
                                                    session_id: session_id.clone(),
                                                    delta,
                                                },
                                            );
                                        }
                                    }
                                    // SessionMessage is #[non_exhaustive]; ignore future variants.
                                    Ok(_) => {}
                                }
                            }
                        }
                        Ok(())
                    }
                },
            )
            .await;

        if let Err(e) = result {
            eprintln!("[acp] connection task ended with error: {e}");
        }
    });

    // Register session in state.
    let state = app.state::<AcpState>();
    let session = Arc::new(Mutex::new(Session {
        project_path,
        first_prompt_sent: false,
        prompt_tx,
        _task: task,
    }));
    state.sessions.lock().await.insert(session_id.clone(), session);

    Ok(session_id)
}

/// Send `text` as a user turn on the given session.
///
/// System-prompt injection: On the **first** prompt of each session we prepend
/// `SYSTEM_PROMPT` to the user text, separated by `"\n\n---\n\n"`. This is an
/// MVP shortcut because ACP 0.11 has no dedicated system-prompt field.
/// Subsequent prompts are forwarded unchanged.
///
/// Blocks until the agent's turn completes (StopReason received), then:
/// - parses the accumulated text for an `a2ui` fenced code block,
/// - on success: emits `a2ui://graph` then `acp://turn-ended { success: true }`,
/// - on failure: emits `acp://turn-ended { success: false, parse_error: "…" }`.
pub async fn send_prompt(app: AppHandle, session_id: String, text: String) -> Result<()> {
    let state = app.state::<AcpState>();

    let sess_arc = {
        let map = state.sessions.lock().await;
        map.get(&session_id)
            .cloned()
            .ok_or_else(|| anyhow!("unknown session {session_id}"))?
    };

    // Build the full prompt text with possible system-prompt prefix.
    let prompt_text = {
        let mut sess = sess_arc.lock().await;
        if !sess.first_prompt_sent {
            sess.first_prompt_sent = true;
            // Prepend system prompt on first call only (no dedicated ACP field in v0.11).
            format!("{SYSTEM_PROMPT}\n\n---\n\n{text}")
        } else {
            text
        }
    };

    // Send the prompt command to the connection task.
    let (reply_tx, reply_rx) = oneshot::channel::<Result<String>>();
    {
        let sess = sess_arc.lock().await;
        sess.prompt_tx
            .send(PromptCommand {
                text: prompt_text,
                reply_tx,
                session_id: session_id.clone(),
                app: app.clone(),
            })
            .await
            .map_err(|_| anyhow!("session connection task is no longer running"))?;
    }

    // Wait for the turn to complete and get the accumulated text.
    let accumulated = reply_rx
        .await
        .map_err(|_| anyhow!("reply channel dropped — connection task may have crashed"))??;

    // Parse and emit events.
    match parse_a2ui_block(&accumulated) {
        Ok(graph) => {
            let _ = app.emit(
                "a2ui://graph",
                GraphEvent {
                    session_id: session_id.clone(),
                    graph,
                },
            );
            let _ = app.emit(
                "acp://turn-ended",
                TurnEndedEvent {
                    session_id,
                    success: true,
                    parse_error: None,
                },
            );
        }
        Err(e) => {
            let _ = app.emit(
                "acp://turn-ended",
                TurnEndedEvent {
                    session_id,
                    success: false,
                    parse_error: Some(e.0),
                },
            );
        }
    }

    Ok(())
}

/// Cancel an in-flight session.
///
/// Removes the session from the state map and drops the handle. Dropping
/// `Session._task` aborts the connection task, which in turn drops the child
/// process (`kill_on_drop(true)` ensures the adapter exits).
pub async fn cancel(app: AppHandle, session_id: String) -> Result<()> {
    let state = app.state::<AcpState>();
    let mut map = state.sessions.lock().await;
    if let Some(sess_arc) = map.remove(&session_id) {
        // Dropping the Arc may or may not free the session immediately (if
        // send_prompt is concurrently holding it). The JoinHandle abort ensures
        // the task exits regardless.
        let sess = sess_arc.lock().await;
        sess._task.abort();
        // Explicit drop isn't strictly needed but makes intent clear.
        drop(sess);
    }
    Ok(())
}
