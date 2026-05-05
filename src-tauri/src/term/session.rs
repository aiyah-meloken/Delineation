use std::path::PathBuf;

use portable_pty::CommandBuilder;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::control::{ensure_project_layout, store_path as control_store_path};
use crate::term::prompts::SYSTEM_PROMPT;

pub(crate) const TAIL_CAP: usize = 256 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TerminalProfileId {
    Shell,
    Claude,
    Codex,
}

#[derive(Clone, Debug, Serialize)]
pub struct TerminalProfile {
    pub id: String,
    pub label: String,
}

pub(crate) fn strip_ansi(s: &str) -> String {
    let re = Regex::new(r"\x1b\[[0-9;?]*[ -/]*[@-~]").unwrap();
    let osc = Regex::new(r"\x1b\][^\x07]*\x07").unwrap();
    let s = re.replace_all(s, "");
    osc.replace_all(&s, "").to_string()
}

fn find_executable(name: &str) -> Option<PathBuf> {
    let paths = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&paths) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn default_shell() -> String {
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.trim().is_empty() {
            return shell;
        }
    }

    for shell in ["zsh", "bash", "fish", "sh"] {
        if let Some(path) = find_executable(shell) {
            return path.to_string_lossy().to_string();
        }
    }

    "sh".to_string()
}

fn shell_label(shell_path: &str) -> String {
    std::path::Path::new(shell_path)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("shell")
        .to_string()
}

pub fn available_profiles() -> Vec<TerminalProfile> {
    let shell = default_shell();
    let mut profiles = vec![TerminalProfile {
        id: "shell".to_string(),
        label: shell_label(&shell),
    }];

    if find_executable("claude").is_some() {
        profiles.push(TerminalProfile {
            id: "claude".to_string(),
            label: "Claude Code".to_string(),
        });
    }

    if find_executable("codex").is_some() {
        profiles.push(TerminalProfile {
            id: "codex".to_string(),
            label: "Codex".to_string(),
        });
    }

    profiles
}

pub(crate) fn apply_common_env(cmd: &mut CommandBuilder) {
    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", path);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("CLICOLOR", "1");
    cmd.env("FORCE_COLOR", "3");
    cmd.env_remove("NO_COLOR");
    cmd.env("TERM_PROGRAM", "Delineation");
    cmd.env("LANG", std::env::var("LANG").unwrap_or_else(|_| "en_US.UTF-8".into()));
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", home);
    }
}

pub(crate) fn apply_delineation_env(cmd: &mut CommandBuilder, project_path: &str, active_view: Option<&str>) {
    let _ = ensure_project_layout(project_path);
    cmd.env("DELINEATION_PROJECT_PATH", project_path);
    cmd.env(
        "DELINEATION_STORE_PATH",
        control_store_path(project_path).to_string_lossy().to_string(),
    );
    cmd.env(
        "DELINEATION_SOCKET",
        crate::daemon::socket_path(project_path)
            .to_string_lossy()
            .to_string(),
    );
    if let Some(active_view) = active_view {
        cmd.env("DELINEATION_ACTIVE_VIEW", active_view);
    }
}

pub(crate) fn command_for_profile(profile: TerminalProfileId, project_path: &str) -> CommandBuilder {
    match profile {
        TerminalProfileId::Shell => CommandBuilder::new(default_shell()),
        TerminalProfileId::Claude => {
            let mut cmd = CommandBuilder::new("claude");
            cmd.arg("--append-system-prompt");
            cmd.arg(SYSTEM_PROMPT);
            cmd
        }
        TerminalProfileId::Codex => {
            let mut cmd = CommandBuilder::new("codex");
            let codex_path = project_path.to_string() + "/.delineation/lenskits/system/operator/CODEX.md";
            cmd.arg(format!(
                "Read {codex_path} for Delineation operator instructions, then wait for my next request."
            ));
            cmd
        }
    }
}

/// Extract the text of the last a2ui block for deduplication purposes.
pub(crate) fn extract_last_a2ui_block_text(text: &str) -> String {
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
