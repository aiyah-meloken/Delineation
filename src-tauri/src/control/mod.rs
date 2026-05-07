use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

const PROJECT_DIR: &str = ".delineation";
const VIEWS_DIR: &str = ".delineation/views";
const RUNTIME_DIR: &str = ".delineation/runtime";
const SOCKET_FILE: &str = ".delineation/runtime/daemon.sock";
const LENSKITS_DIR: &str = ".delineation/lenskits";
const VERSIONS_DIR: &str = ".delineation/versions/views";
const SYSTEM_CODEX_PATH: &str = ".delineation/lenskits/system/operator/CODEX.md";
const SYSTEM_LENSKIT_MANIFEST: &str = ".delineation/lenskits/system/lenskit.json";

#[derive(Clone, Default, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchContext {
    pub project_path: Option<String>,
    pub store_path: Option<String>,
    pub socket_path: Option<String>,
    pub active_view: Option<String>,
    pub lenskits: Vec<LensKitInfo>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlInfo {
    pub socket_path: String,
    pub store_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewVersionInfo {
    pub id: String,
    pub created_at: String,
    pub path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LensKitManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LensKitInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub path: String,
    pub has_operator: bool,
    pub has_renderer: bool,
    pub has_watcher: bool,
    pub operator_files: Vec<String>,
    pub renderer_files: Vec<String>,
    pub watcher_files: Vec<String>,
}

#[derive(Default)]
pub struct ControlState {
    context: Mutex<WorkbenchContext>,
}

impl ControlState {
    pub fn new() -> Self {
        Self::default()
    }
}

#[cfg(test)]
#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    #[allow(dead_code)]
    jsonrpc: Option<String>,
    id: Option<Value>,
    method: Option<String>,
    params: Option<Value>,
}

fn project_child(project_path: &str, child: &str) -> PathBuf {
    Path::new(project_path).join(child)
}

pub fn store_path(project_path: &str) -> PathBuf {
    project_child(project_path, PROJECT_DIR)
}

pub fn socket_path(project_path: &str) -> PathBuf {
    project_child(project_path, SOCKET_FILE)
}

pub fn codex_lenskit_path(project_path: &str) -> PathBuf {
    project_child(project_path, SYSTEM_CODEX_PATH)
}

pub fn lenskits_path(project_path: &str) -> PathBuf {
    project_child(project_path, LENSKITS_DIR)
}

fn views_path(project_path: &str) -> PathBuf {
    project_child(project_path, VIEWS_DIR)
}

fn versions_root(project_path: &str) -> PathBuf {
    project_child(project_path, VERSIONS_DIR)
}

fn normalize_view_path(input: &str) -> Result<String> {
    let clean = input.replace('\\', "/").trim_matches('/').to_string();
    if clean.is_empty() {
        return Err(anyhow!("view path is required"));
    }
    if clean.contains("..") {
        return Err(anyhow!("view path cannot contain '..'"));
    }
    if !clean.to_lowercase().ends_with(".a2ui.json") {
        return Ok(format!("{clean}.a2ui.json"));
    }
    Ok(clean)
}

fn title_to_filename(title: &str) -> String {
    let stem = title
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let stem = if stem.is_empty() {
        "untitled".to_string()
    } else {
        stem
    };
    format!("{stem}.a2ui.json")
}

fn version_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{millis}")
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn encode_view_id(view_path: &str) -> String {
    view_path.replace('/', "__").replace('\\', "__")
}

fn write_json_file(path: &Path, value: &Value) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = fs::File::create(path)?;
    file.write_all(serde_json::to_string_pretty(value)?.as_bytes())?;
    file.write_all(b"\n")?;
    Ok(())
}

fn list_component_files(dir: &Path) -> Result<Vec<String>> {
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut files = vec![];
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if entry.file_type()?.is_file() {
            files.push(entry.file_name().to_string_lossy().to_string());
        }
    }
    files.sort();
    Ok(files)
}

pub fn discover_lenskits(project_path: &str) -> Result<Vec<LensKitInfo>> {
    ensure_system_lenskit(project_path)?;
    let root = lenskits_path(project_path);
    if !root.exists() {
        return Ok(vec![]);
    }

    let mut kits = vec![];
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let path = entry.path();
        let manifest_path = path.join("lenskit.json");
        if !manifest_path.exists() {
            continue;
        }
        let manifest_text = fs::read_to_string(&manifest_path)?;
        let manifest: LensKitManifest = serde_json::from_str(&manifest_text)
            .with_context(|| format!("invalid LensKit manifest {}", manifest_path.display()))?;
        let operator_files = list_component_files(&path.join("operator"))?;
        let renderer_files = list_component_files(&path.join("renderer"))?;
        let watcher_files = list_component_files(&path.join("watcher"))?;
        kits.push(LensKitInfo {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            path: path.to_string_lossy().to_string(),
            has_operator: path.join("operator").is_dir(),
            has_renderer: path.join("renderer").is_dir(),
            has_watcher: path.join("watcher").is_dir(),
            operator_files,
            renderer_files,
            watcher_files,
        });
    }
    kits.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(kits)
}

fn validate_status(status: &str) -> Result<()> {
    match status {
        "draft" | "reviewed" | "confirmed" => Ok(()),
        _ => Err(anyhow!("invalid status '{status}'")),
    }
}

fn validate_a2ui_messages(messages: &Value) -> Result<()> {
    let arr = messages
        .as_array()
        .ok_or_else(|| anyhow!("a2uiMessages must be an array"))?;

    for (index, message) in arr.iter().enumerate() {
        let obj = message
            .as_object()
            .ok_or_else(|| anyhow!("a2uiMessages[{index}] must be an object"))?;
        if obj.get("version").and_then(Value::as_str) != Some("v0.9") {
            return Err(anyhow!("a2uiMessages[{index}] must use version 'v0.9'"));
        }

        let known = [
            obj.contains_key("createSurface"),
            obj.contains_key("updateComponents"),
            obj.contains_key("updateDataModel"),
            obj.contains_key("deleteSurface"),
        ]
        .into_iter()
        .filter(|present| *present)
        .count();
        if known != 1 {
            return Err(anyhow!(
                "a2uiMessages[{index}] must contain exactly one A2UI operation"
            ));
        }

        if let Some(create) = obj.get("createSurface") {
            let create = create
                .as_object()
                .ok_or_else(|| anyhow!("createSurface must be an object"))?;
            if create.get("surfaceId").and_then(Value::as_str).is_none() {
                return Err(anyhow!("createSurface.surfaceId is required"));
            }
            if create.get("catalogId").and_then(Value::as_str).is_none() {
                return Err(anyhow!("createSurface.catalogId is required"));
            }
        }

        if let Some(update) = obj.get("updateComponents") {
            let update = update
                .as_object()
                .ok_or_else(|| anyhow!("updateComponents must be an object"))?;
            if update.get("surfaceId").and_then(Value::as_str).is_none() {
                return Err(anyhow!("updateComponents.surfaceId is required"));
            }
            if !update
                .get("components")
                .map(|components| components.is_array())
                .unwrap_or(false)
            {
                return Err(anyhow!("updateComponents.components must be an array"));
            }
        }
    }

    Ok(())
}

fn validate_facts(facts: &Value) -> Result<()> {
    let arr = facts
        .as_array()
        .ok_or_else(|| anyhow!("facts must be an array"))?;

    for (index, fact) in arr.iter().enumerate() {
        let obj = fact
            .as_object()
            .ok_or_else(|| anyhow!("facts[{index}] must be an object"))?;
        if obj.get("id").and_then(Value::as_str).is_none() {
            return Err(anyhow!("facts[{index}].id is required"));
        }
        if obj.get("label").and_then(Value::as_str).is_none() {
            return Err(anyhow!("facts[{index}].label is required"));
        }
        if obj.get("source").and_then(Value::as_str).is_none() {
            return Err(anyhow!("facts[{index}].source is required"));
        }
    }

    Ok(())
}

fn default_a2ui_messages(title: &str) -> Value {
    json!([
        {
            "version": "v0.9",
            "createSurface": {
                "surfaceId": "main",
                "catalogId": "https://a2ui.org/specification/v0_9/basic_catalog.json"
            }
        },
        {
            "version": "v0.9",
            "updateComponents": {
                "surfaceId": "main",
                "components": [
                    {
                        "id": "root",
                        "component": "Column",
                        "children": ["title", "body"]
                    },
                    {
                        "id": "title",
                        "component": "Text",
                        "variant": "h1",
                        "text": title
                    },
                    {
                        "id": "body",
                        "component": "Text",
                        "text": "Ask the Agent to generate or update this View."
                    }
                ]
            }
        }
    ])
}

pub fn ensure_project_layout(project_path: &str) -> Result<ControlInfo> {
    fs::create_dir_all(project_child(project_path, VIEWS_DIR))?;
    fs::create_dir_all(project_child(project_path, RUNTIME_DIR))?;
    fs::create_dir_all(project_child(project_path, LENSKITS_DIR))?;
    fs::create_dir_all(versions_root(project_path))?;
    ensure_system_lenskit(project_path)?;

    Ok(ControlInfo {
        socket_path: socket_path(project_path).to_string_lossy().to_string(),
        store_path: store_path(project_path).to_string_lossy().to_string(),
    })
}

fn ensure_system_lenskit(project_path: &str) -> Result<()> {
    let manifest_path = project_child(project_path, SYSTEM_LENSKIT_MANIFEST);
    let codex_path = codex_lenskit_path(project_path);
    let system_root = manifest_path
        .parent()
        .ok_or_else(|| anyhow!("invalid system LensKit path"))?;

    fs::create_dir_all(system_root.join("operator"))?;
    fs::create_dir_all(system_root.join("renderer"))?;
    fs::create_dir_all(system_root.join("watcher"))?;

    write_json_file(
        &manifest_path,
        &json!({
            "id": "system",
            "name": "System A2UI Orientation",
            "version": "0.1.0",
            "description": "Built-in LensKit for project orientation, A2UI View creation, and Codex operator workflows."
        }),
    )?;

    fs::write(
        system_root.join("renderer").join("basic-catalog.json"),
        serde_json::to_string_pretty(&json!({
            "catalogId": "https://a2ui.org/specification/v0_9/basic_catalog.json",
            "protocol": "a2ui:v0.9",
            "components": [
                "Text",
                "Column",
                "Row",
                "List",
                "Card",
                "Tabs",
                "Divider",
                "Button",
                "TextField",
                "CheckBox",
                "ChoicePicker",
                "Slider"
            ],
            "notes": "MVP renderer uses @a2ui/react/v0_9 basicCatalog in the Workbench."
        }))? + "\n",
    )?;

    fs::write(
        system_root.join("watcher").join("README.md"),
        "# Watcher\n\nWatcher definitions are packaged here for LensKit completeness, but the MVP keeps watcher execution disabled.\n",
    )?;

    fs::write(
        system_root.join("operator").join("delineation_control.py"),
        r#"#!/usr/bin/env python3
import argparse
import json
import os
import socket
import sys


def rpc(method, params=None):
    sock = os.environ.get("DELINEATION_SOCKET")
    if not sock:
        raise SystemExit("DELINEATION_SOCKET is not set")
    req = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(10)
    s.connect(sock)
    s.sendall((json.dumps(req) + "\n").encode())
    chunks = []
    while True:
        data = s.recv(1048576)
        if not data:
            break
        chunks.append(data)
        if b"\n" in data:
            break
    response = json.loads(b"".join(chunks).decode())
    if "error" in response:
        raise SystemExit(response["error"]["message"])
    return response["result"]


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_messages(path):
    value = load_json(path)
    if isinstance(value, dict) and "a2uiMessages" in value:
        return value["a2uiMessages"]
    return value


def main():
    parser = argparse.ArgumentParser(description="Delineation LensKit control helper")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("context")
    sub.add_parser("lenskits")
    sub.add_parser("focus-window")

    open_view = sub.add_parser("open-view")
    open_view.add_argument("--view-path", required=True)

    focus_view = sub.add_parser("focus-view")
    focus_view.add_argument("--view-path", required=True)

    versions = sub.add_parser("versions")
    versions.add_argument("--view-path", required=True)

    get_version = sub.add_parser("get-version")
    get_version.add_argument("--view-path", required=True)
    get_version.add_argument("--version-id", required=True)

    create = sub.add_parser("create-view")
    create.add_argument("--title", required=True)
    create.add_argument("--view-path")
    create.add_argument("--status", choices=["draft", "reviewed", "confirmed"], default="draft")
    create.add_argument("--messages-file")
    create.add_argument("--facts-file")

    update = sub.add_parser("update-view")
    update.add_argument("--view-path", required=True)
    update.add_argument("--title")
    update.add_argument("--status", choices=["draft", "reviewed", "confirmed"])
    update.add_argument("--messages-file", required=True)
    update.add_argument("--facts-file")

    set_status = sub.add_parser("set-status")
    set_status.add_argument("--view-path", required=True)
    set_status.add_argument("--status", choices=["draft", "reviewed", "confirmed"], required=True)

    args = parser.parse_args()
    if args.cmd == "context":
        print(json.dumps(rpc("workbench.context.get"), ensure_ascii=False, indent=2))
    elif args.cmd == "lenskits":
        print(json.dumps(rpc("lenskit.list"), ensure_ascii=False, indent=2))
    elif args.cmd == "focus-window":
        print(json.dumps(rpc("workbench.window.focus"), ensure_ascii=False, indent=2))
    elif args.cmd == "open-view":
        print(json.dumps(rpc("view.open", {"viewPath": args.view_path}), ensure_ascii=False, indent=2))
    elif args.cmd == "focus-view":
        print(json.dumps(rpc("view.focus", {"viewPath": args.view_path}), ensure_ascii=False, indent=2))
    elif args.cmd == "versions":
        print(json.dumps(rpc("view.version.list", {"viewPath": args.view_path}), ensure_ascii=False, indent=2))
    elif args.cmd == "get-version":
        print(json.dumps(rpc("view.version.get", {"viewPath": args.view_path, "versionId": args.version_id}), ensure_ascii=False, indent=2))
    elif args.cmd == "create-view":
        params = {"title": args.title, "status": args.status}
        if args.view_path:
            params["viewPath"] = args.view_path
        if args.messages_file:
            params["a2uiMessages"] = load_messages(args.messages_file)
        if args.facts_file:
            params["facts"] = load_json(args.facts_file)
        print(json.dumps(rpc("view.create", params), ensure_ascii=False, indent=2))
    elif args.cmd == "update-view":
        params = {"viewPath": args.view_path, "a2uiMessages": load_messages(args.messages_file)}
        if args.title:
            params["title"] = args.title
        if args.status:
            params["status"] = args.status
        if args.facts_file:
            params["facts"] = load_json(args.facts_file)
        print(json.dumps(rpc("view.updateA2UI", params), ensure_ascii=False, indent=2))
    elif args.cmd == "set-status":
        print(json.dumps(rpc("view.updateStatus", {"viewPath": args.view_path, "status": args.status}), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
"#,
    )?;

    let helper = system_root.join("operator").join("delineation_control.py");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(&helper)?.permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&helper, permissions)?;
    }

    fs::write(
        codex_path,
        r#"# Delineation Operator Skill

You are running inside Delineation's Terminal. Delineation is not a chatbox; it is a workbench for creating durable, reviewable software-understanding Views.

This built-in Operator LensKit tells you how to cooperate with Delineation when the user asks you to understand code, explain architecture, draw a flow, create a View, update a View, or turn terminal analysis into a persistent artifact.

## Delineation Operating Loop

1. Get context.
   - Run `context` before creating or updating a View.
   - Notice `DELINEATION_ACTIVE_VIEW`; update it when the user is clearly refining the current View.
2. Inspect the real project.
   - Use normal terminal tools such as `rg`, `find`, package scripts, tests, and source reads.
   - Prefer primary code evidence over guesses.
3. Decide the View shape.
   - Choose a human-readable structure for the user's question: flow, module map, data model, lifecycle, checklist, risk review, or concise prose.
   - Keep the View focused. One View should answer one architectural question well.
4. Create A2UI v0.9 messages.
   - Use the basic catalog only.
   - Keep component ids stable and semantic enough for future diff anchors.
5. Attach facts.
   - Use facts for every non-obvious claim.
   - A fact should point to a file, function, schema, command, or other inspectable source.
6. Persist through Delineation.
   - Do not answer only in chat when the user asked for a View, diagram, architecture explanation, codebase understanding, or project orientation.
   - Use `create-view` for new understanding and `update-view` for refinement.
7. Open or focus the View.
   - Make the Workbench show the artifact so the user can review it.
8. Report briefly.
   - Tell the user what View changed and what evidence it is based on.

## Environment

- `DELINEATION_PROJECT_PATH`: current Project root.
- `DELINEATION_STORE_PATH`: `.delineation` store path.
- `DELINEATION_SOCKET`: newline-delimited JSON-RPC socket.
- `DELINEATION_ACTIVE_VIEW`: current View path, if one is active.

## Helper Commands

```bash
python3 "$DELINEATION_STORE_PATH/lenskits/system/operator/delineation_control.py" context
python3 "$DELINEATION_STORE_PATH/lenskits/system/operator/delineation_control.py" lenskits
python3 "$DELINEATION_STORE_PATH/lenskits/system/operator/delineation_control.py" focus-window
python3 "$DELINEATION_STORE_PATH/lenskits/system/operator/delineation_control.py" create-view --title "Subscription Flow" --messages-file /tmp/subscription-flow.a2ui.json --facts-file /tmp/subscription-flow.facts.json
python3 "$DELINEATION_STORE_PATH/lenskits/system/operator/delineation_control.py" update-view --view-path "subscription-flow.a2ui.json" --messages-file /tmp/subscription-flow.a2ui.json --facts-file /tmp/subscription-flow.facts.json
python3 "$DELINEATION_STORE_PATH/lenskits/system/operator/delineation_control.py" set-status --view-path "subscription-flow.a2ui.json" --status reviewed
python3 "$DELINEATION_STORE_PATH/lenskits/system/operator/delineation_control.py" open-view --view-path "subscription-flow.a2ui.json"
python3 "$DELINEATION_STORE_PATH/lenskits/system/operator/delineation_control.py" versions --view-path "subscription-flow.a2ui.json"
python3 "$DELINEATION_STORE_PATH/lenskits/system/operator/delineation_control.py" get-version --view-path "subscription-flow.a2ui.json" --version-id "..."
```

## When To Create vs Update

Create a new View when:
- The user asks a new architectural question.
- The current active View is unrelated.
- The result deserves its own review surface.

Update the active View when:
- The user is refining, correcting, expanding, or asking for a clearer version of the same topic.
- `DELINEATION_ACTIVE_VIEW` is set and matches the request.
- You are incorporating new evidence into the same understanding.

Set status:
- `draft`: initial or uncertain analysis.
- `reviewed`: you inspected the code and facts are sufficient for human review.
- `confirmed`: only when the user explicitly confirms the View.

## Review-ready View checklist

Before calling `create-view` or `update-view`, check:

- The title states the architectural subject, not a generic label.
- The first screen explains the answer in one or two concise paragraphs.
- The structure supports review: sections, cards, lists, or tabs are grouped by meaning.
- Every non-obvious claim has a corresponding fact.
- Facts use inspectable sources such as `src/file.ts:functionName`, `schema/table.sql`, or `command:npm test`.
- The View does not contain filler such as "maybe", "likely", or ungrounded speculation unless explicitly marked as an open question.
- The A2UI JSON validates against the basic catalog rules below.
- The final answer in chat is short; the durable artifact lives in Delineation.

## A2UI Message Shape

Save an array of A2UI v0.9 messages. The Workbench renderer uses:
`https://a2ui.org/specification/v0_9/basic_catalog.json`

Important basic catalog rules:
- `Row`, `Column`, and `List` use `children: ["child-id"]`.
- `Card` uses exactly one `child: "child-id"`. If a card needs a title and body, create a `Column` component and set the card's `child` to that Column. Do not put `children` directly on `Card`.
- `Tabs` uses `tabs: [{ "title": "...", "child": "child-id" }]`.
- Every referenced child id must exist in the same View.
- Text should be evidence-oriented and readable. Avoid dumping raw code into large Text components.
- Prefer 6-12 meaningful blocks over one huge paragraph.

```json
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "main",
      "catalogId": "https://a2ui.org/specification/v0_9/basic_catalog.json"
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "main",
      "components": [
        { "id": "root", "component": "Column", "children": ["title", "summary", "steps"] },
        { "id": "title", "component": "Text", "variant": "h1", "text": "Subscription Flow" },
        { "id": "summary", "component": "Text", "text": "Short project-specific summary with code evidence." },
        { "id": "steps", "component": "Column", "children": ["step1", "step2"] },
        { "id": "step1", "component": "Text", "text": "1. User action -> relevant file/function." },
        { "id": "step2", "component": "Text", "text": "2. Backend/API/data flow -> relevant file/function." },
        { "id": "risk-card", "component": "Card", "child": "risk-content" },
        { "id": "risk-content", "component": "Column", "children": ["risk-title", "risk-body"] },
        { "id": "risk-title", "component": "Text", "variant": "h2", "text": "Risk" },
        { "id": "risk-body", "component": "Text", "text": "A Card wraps one child, so multiple elements go inside this Column." }
      ]
    }
  }
]
```

## Recommended View Patterns

Use these structures unless the user's request suggests something better:

- Flow question: `Column` with title, summary, `Row` or ordered Text steps, risks/open questions, facts.
- Module map: title, boundary summary, cards per module, dependency notes, facts.
- Data model: title, tables/entities, important fields, relationships, invariants, facts.
- Agent/workflow analysis: title, actor loop, tool/control boundary, failure modes, facts.
- Architecture review: title, what changed, impacted Views/Facts, risks, recommended follow-up.

## Facts Shape

```json
[
  { "id": "fact-1", "label": "Subscription entry point", "source": "src/path/file.ts:functionName" }
]
```

Fact quality rules:
- Use facts for code evidence that a human or future Agent can inspect later.
- Prefer specific paths and symbols over broad directories.
- If evidence comes from a command, use `command:<command>` as the source and put the important result in the label.
- A View without facts is allowed only for a first draft, and should stay `draft`.

## Minimal End-to-End Example

```bash
cat > /tmp/subscription-flow.a2ui.json <<'JSON'
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "main",
      "catalogId": "https://a2ui.org/specification/v0_9/basic_catalog.json"
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "main",
      "components": [
        { "id": "root", "component": "Column", "children": ["title", "summary", "flow"] },
        { "id": "title", "component": "Text", "variant": "h1", "text": "User Subscription Flow" },
        { "id": "summary", "component": "Text", "text": "A concise explanation grounded in inspected code." },
        { "id": "flow", "component": "List", "children": ["step-1", "step-2"] },
        { "id": "step-1", "component": "Text", "text": "1. User starts checkout from the billing UI." },
        { "id": "step-2", "component": "Text", "text": "2. Backend validates plan and writes subscription state." }
      ]
    }
  }
]
JSON

cat > /tmp/subscription-flow.facts.json <<'JSON'
[
  { "id": "fact-checkout-ui", "label": "Checkout action is initiated from billing UI", "source": "src/billing/CheckoutButton.tsx" },
  { "id": "fact-subscription-api", "label": "Subscription state is written by backend handler", "source": "src/api/subscriptions.ts:createSubscription" }
]
JSON

python3 "$DELINEATION_STORE_PATH/lenskits/system/operator/delineation_control.py" create-view \
  --title "User Subscription Flow" \
  --status reviewed \
  --messages-file /tmp/subscription-flow.a2ui.json \
  --facts-file /tmp/subscription-flow.facts.json
```
"#,
    )?;
    Ok(())
}

pub async fn set_context(
    app: AppHandle,
    project_path: Option<String>,
    active_view: Option<String>,
) -> Result<()> {
    let state = app.state::<ControlState>();
    let mut context = state.context.lock().await;

    let store_path = project_path
        .as_ref()
        .map(|path| store_path(path).to_string_lossy().to_string());
    let socket_path = project_path.as_ref().map(|path| {
        crate::daemon::socket_path(path)
            .to_string_lossy()
            .to_string()
    });

    *context = WorkbenchContext {
        project_path,
        store_path,
        socket_path,
        active_view,
        lenskits: vec![],
    };
    Ok(())
}

pub fn daemon_dispatch_core(
    project_path: &str,
    socket_path: String,
    active_view: Option<String>,
    method: &str,
    params: Value,
) -> Result<(Value, Option<crate::daemon::WorkbenchEvent>)> {
    let result = match method {
        "workbench.context.get" => Ok(json!(WorkbenchContext {
            project_path: Some(project_path.to_string()),
            store_path: Some(store_path(project_path).to_string_lossy().to_string()),
            socket_path: Some(socket_path),
            active_view,
            lenskits: discover_lenskits(project_path).unwrap_or_default(),
        })),
        "lenskit.list" => discover_lenskits(project_path)
            .and_then(|kits| serde_json::to_value(kits).map_err(Into::into)),
        "view.create" => {
            let (result, view_path) = view_create_core(project_path, params)?;
            return Ok((
                result,
                Some(crate::daemon::WorkbenchEvent::ViewChanged {
                    action: "create".to_string(),
                    view_path,
                }),
            ));
        }
        "view.updateA2UI" => {
            let (result, view_path) = view_update_a2ui_core(project_path, params)?;
            return Ok((
                result,
                Some(crate::daemon::WorkbenchEvent::ViewChanged {
                    action: "update".to_string(),
                    view_path,
                }),
            ));
        }
        "view.updateStatus" => {
            let (result, view_path) = view_update_status_core(project_path, params)?;
            return Ok((
                result,
                Some(crate::daemon::WorkbenchEvent::ViewChanged {
                    action: "update".to_string(),
                    view_path,
                }),
            ));
        }
        "view.open" | "view.focus" => {
            let view_path = normalize_view_path(
                params
                    .get("viewPath")
                    .and_then(Value::as_str)
                    .ok_or_else(|| anyhow!("viewPath is required"))?,
            )?;
            return Ok((
                json!({ "viewPath": view_path }),
                Some(crate::daemon::WorkbenchEvent::ViewChanged {
                    action: "open".to_string(),
                    view_path,
                }),
            ));
        }
        "view.version.list" => version_list(project_path, params),
        "view.version.get" => version_get(project_path, params),
        _ => Err(anyhow!("Unknown method: {method}")),
    }?;
    Ok((result, None))
}

#[cfg(test)]
async fn handle_json_rpc_line_without_app(project_path: &str, line: &str) -> Value {
    let parsed = match serde_json::from_str::<JsonRpcRequest>(line) {
        Ok(request) => request,
        Err(err) => return json_rpc_error(None, -32700, format!("Parse error: {err}")),
    };

    let id = parsed.id.clone();
    let Some(method) = parsed.method.as_deref() else {
        return json_rpc_error(id, -32600, "Invalid Request: missing method");
    };

    let params = parsed.params.unwrap_or_else(|| json!({}));
    let result = match method {
        "workbench.context.get" => Ok(json!(WorkbenchContext {
            project_path: Some(project_path.to_string()),
            store_path: Some(store_path(project_path).to_string_lossy().to_string()),
            socket_path: Some(crate::daemon::socket_path(project_path).to_string_lossy().to_string()),
            active_view: None,
            lenskits: discover_lenskits(project_path).unwrap_or_default(),
        })),
        "lenskit.list" => discover_lenskits(project_path)
            .and_then(|kits| serde_json::to_value(kits).map_err(Into::into)),
        "workbench.window.open" | "workbench.window.focus" => {
            Ok(json!({ "window": "main", "focused": true }))
        }
        "view.create" => view_create_core(project_path, params).map(|(result, _)| result),
        "view.updateA2UI" => view_update_a2ui_core(project_path, params).map(|(result, _)| result),
        "view.updateStatus" => {
            view_update_status_core(project_path, params).map(|(result, _)| result)
        }
        "view.version.list" => version_list(project_path, params),
        "view.version.get" => version_get(project_path, params),
        _ => Err(anyhow!("Unknown method: {method}")),
    };

    match result {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err(err) => json_rpc_error(id, -32000, err.to_string()),
    }
}

#[cfg(test)]
fn json_rpc_error(id: Option<Value>, code: i32, message: impl Into<String>) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id.unwrap_or(Value::Null),
        "error": { "code": code, "message": message.into() }
    })
}

fn a2ui_document(
    title: &str,
    status: &str,
    a2ui_messages: Value,
    facts: Value,
    versions: Value,
) -> Value {
    json!({
        "kind": "a2ui-view",
        "version": 1,
        "title": title,
        "status": status,
        "a2uiMessages": a2ui_messages,
        "facts": facts,
        "versions": versions,
        "updatedAt": now_iso()
    })
}

fn view_create_core(project_path: &str, params: Value) -> Result<(Value, String)> {
    let title = params
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("Untitled")
        .trim();
    let title = if title.is_empty() { "Untitled" } else { title };
    let explicit_path = params
        .get("viewPath")
        .or_else(|| params.get("path"))
        .and_then(Value::as_str)
        .map(normalize_view_path)
        .transpose()?;
    let mut path = explicit_path
        .clone()
        .unwrap_or_else(|| title_to_filename(title));
    let status = params
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("draft");
    validate_status(status)?;
    let messages = params
        .get("a2uiMessages")
        .cloned()
        .unwrap_or_else(|| default_a2ui_messages(title));
    validate_a2ui_messages(&messages)?;
    let facts = params.get("facts").cloned().unwrap_or_else(|| json!([]));
    validate_facts(&facts)?;

    let doc = a2ui_document(title, status, messages, facts, json!([]));
    let views = views_path(project_path);
    let mut full = views.join(&path);
    if explicit_path.is_some() && full.exists() {
        return Err(anyhow!("View already exists: {path}"));
    }
    if explicit_path.is_none() {
        let stem = path.trim_end_matches(".a2ui.json").to_string();
        let mut index = 1;
        while full.exists() {
            path = format!("{stem}-{index}.a2ui.json");
            full = views.join(&path);
            index += 1;
        }
    }
    write_json_file(&full, &doc)?;

    let result = json!({
        "viewPath": path,
        "title": title,
        "status": status
    });

    Ok((result, path))
}

fn view_update_a2ui_core(project_path: &str, params: Value) -> Result<(Value, String)> {
    let view_path = normalize_view_path(
        params
            .get("viewPath")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow!("viewPath is required"))?,
    )?;
    let full = views_path(project_path).join(&view_path);
    if !full.exists() {
        return Err(anyhow!("View does not exist: {view_path}"));
    }
    let snapshot = snapshot_version(project_path, &view_path, &full)?;

    let existing = read_json_if_exists(&full).unwrap_or_else(|| json!({}));
    let title = params
        .get("title")
        .and_then(Value::as_str)
        .or_else(|| existing.get("title").and_then(Value::as_str))
        .unwrap_or("Untitled");
    let status = params
        .get("status")
        .and_then(Value::as_str)
        .or_else(|| existing.get("status").and_then(Value::as_str))
        .unwrap_or("draft");
    validate_status(status)?;
    let messages = params
        .get("a2uiMessages")
        .cloned()
        .ok_or_else(|| anyhow!("a2uiMessages is required"))?;
    validate_a2ui_messages(&messages)?;
    let facts = params
        .get("facts")
        .cloned()
        .or_else(|| existing.get("facts").cloned())
        .unwrap_or_else(|| json!([]));
    validate_facts(&facts)?;
    let mut versions = existing
        .get("versions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    versions.insert(0, serde_json::to_value(&snapshot)?);

    let doc = a2ui_document(title, status, messages, facts, Value::Array(versions));
    write_json_file(&full, &doc)?;

    let result = json!({ "viewPath": view_path, "title": title, "status": status });
    Ok((result, view_path))
}

fn view_update_status_core(project_path: &str, params: Value) -> Result<(Value, String)> {
    let view_path = normalize_view_path(
        params
            .get("viewPath")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow!("viewPath is required"))?,
    )?;
    let status = params
        .get("status")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("status is required"))?;
    validate_status(status)?;

    let full = views_path(project_path).join(&view_path);
    if !full.exists() {
        return Err(anyhow!("View does not exist: {view_path}"));
    }
    let snapshot = snapshot_version(project_path, &view_path, &full)?;
    let existing =
        read_json_if_exists(&full).ok_or_else(|| anyhow!("View is not valid JSON: {view_path}"))?;

    let title = existing
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("Untitled");
    let messages = existing
        .get("a2uiMessages")
        .cloned()
        .ok_or_else(|| anyhow!("View is missing a2uiMessages: {view_path}"))?;
    validate_a2ui_messages(&messages)?;
    let facts = existing.get("facts").cloned().unwrap_or_else(|| json!([]));
    validate_facts(&facts)?;
    let mut versions = existing
        .get("versions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    versions.insert(0, serde_json::to_value(&snapshot)?);

    let doc = a2ui_document(title, status, messages, facts, Value::Array(versions));
    write_json_file(&full, &doc)?;

    let result = json!({ "viewPath": view_path, "title": title, "status": status });
    Ok((result, view_path))
}

fn read_json_if_exists(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn snapshot_version(
    project_path: &str,
    view_path: &str,
    full_path: &Path,
) -> Result<ViewVersionInfo> {
    let text = fs::read_to_string(full_path)?;
    if text.trim().is_empty() {
        return Err(anyhow!("cannot snapshot empty view"));
    }
    let id = version_id();
    let encoded = encode_view_id(view_path);
    let rel = format!("{encoded}/{id}.json");
    let version_path = versions_root(project_path).join(&rel);
    if let Some(parent) = version_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&version_path, text)?;
    Ok(ViewVersionInfo {
        id,
        created_at: now_iso(),
        path: rel,
    })
}

pub fn list_versions_for_view(project_path: &str, view_path: &str) -> Result<Vec<ViewVersionInfo>> {
    let view_path = normalize_view_path(view_path)?;
    let encoded = encode_view_id(&view_path);
    let dir = versions_root(project_path).join(encoded);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut versions = vec![];
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".json") {
            continue;
        }
        let id = name.trim_end_matches(".json").to_string();
        let created_at = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .map(chrono::DateTime::<chrono::Utc>::from)
            .map(|time| time.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
            .unwrap_or_else(|_| id.clone());
        versions.push(ViewVersionInfo {
            id: id.clone(),
            created_at,
            path: entry.path().to_string_lossy().to_string(),
        });
    }
    versions.sort_by(|a, b| b.id.cmp(&a.id));
    Ok(versions)
}

fn version_list(project_path: &str, params: Value) -> Result<Value> {
    let view_path = params
        .get("viewPath")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("viewPath is required"))?;
    Ok(serde_json::to_value(list_versions_for_view(
        project_path,
        view_path,
    )?)?)
}

fn version_get(project_path: &str, params: Value) -> Result<Value> {
    let view_path = normalize_view_path(
        params
            .get("viewPath")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow!("viewPath is required"))?,
    )?;
    let version = params
        .get("versionId")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("versionId is required"))?;
    let full = versions_root(project_path)
        .join(encode_view_id(&view_path))
        .join(format!("{version}.json"));
    let text = fs::read_to_string(full)?;
    Ok(json!({ "versionId": version, "content": text }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::{UnixListener, UnixStream};

    fn temp_project(name: &str) -> PathBuf {
        let base =
            std::env::temp_dir().join(format!("delineation-control-test-{name}-{}", version_id()));
        fs::create_dir_all(&base).unwrap();
        base
    }

    #[test]
    fn ensure_layout_creates_socket_parent_and_system_lenskit() {
        let project = temp_project("layout");
        let info = ensure_project_layout(project.to_str().unwrap()).unwrap();

        assert!(PathBuf::from(info.store_path).exists());
        assert!(PathBuf::from(info.socket_path).parent().unwrap().exists());
        assert!(project.join(SYSTEM_LENSKIT_MANIFEST).exists());
        assert!(codex_lenskit_path(project.to_str().unwrap()).exists());
        assert!(project
            .join(".delineation/lenskits/system/operator/delineation_control.py")
            .exists());
        assert!(project
            .join(".delineation/lenskits/system/renderer/basic-catalog.json")
            .exists());
        assert!(project
            .join(".delineation/lenskits/system/watcher/README.md")
            .exists());
        let helper = fs::read_to_string(
            project.join(".delineation/lenskits/system/operator/delineation_control.py"),
        )
        .unwrap();
        assert!(helper.contains("open-view"));
        assert!(helper.contains("get-version"));
        assert!(helper.contains("set-status"));
        assert!(helper.contains("view.updateStatus"));
        let codex = fs::read_to_string(codex_lenskit_path(project.to_str().unwrap())).unwrap();
        assert!(codex.contains("Delineation Operating Loop"));
        assert!(codex.contains("Do not answer only in chat"));
        assert!(codex.contains("Use facts for every non-obvious claim"));
        assert!(codex.contains("Review-ready View checklist"));
    }

    #[test]
    fn discovers_system_lenskit_components() {
        let project = temp_project("lenskits");
        ensure_project_layout(project.to_str().unwrap()).unwrap();

        let kits = discover_lenskits(project.to_str().unwrap()).unwrap();

        assert_eq!(kits.len(), 1);
        assert_eq!(kits[0].id, "system");
        assert!(kits[0].has_operator);
        assert!(kits[0].has_renderer);
        assert!(kits[0].has_watcher);
        assert!(kits[0].operator_files.contains(&"CODEX.md".to_string()));
        assert!(kits[0]
            .operator_files
            .contains(&"delineation_control.py".to_string()));
    }

    #[test]
    fn normalize_view_path_adds_extension_and_rejects_parent_segments() {
        assert_eq!(
            normalize_view_path("flows/signup").unwrap(),
            "flows/signup.a2ui.json"
        );
        assert!(normalize_view_path("../secret").is_err());
    }

    #[test]
    fn validates_a2ui_messages_shape_before_persisting() {
        let valid = default_a2ui_messages("Valid");
        assert!(validate_a2ui_messages(&valid).is_ok());

        let missing_operation = json!([{ "version": "v0.9" }]);
        assert!(validate_a2ui_messages(&missing_operation)
            .unwrap_err()
            .to_string()
            .contains("exactly one"));

        let wrong_version = json!([{ "version": "0.9", "deleteSurface": { "surfaceId": "main" } }]);
        assert!(validate_a2ui_messages(&wrong_version)
            .unwrap_err()
            .to_string()
            .contains("v0.9"));
    }

    #[test]
    fn validates_facts_shape() {
        assert!(validate_facts(&json!([
            { "id": "fact-1", "label": "Entry point", "source": "src/main.ts" }
        ]))
        .is_ok());

        assert!(
            validate_facts(&json!([{ "id": "fact-1", "label": "Missing source" }]))
                .unwrap_err()
                .to_string()
                .contains("source")
        );
        assert!(validate_facts(&json!({ "id": "not-an-array" }))
            .unwrap_err()
            .to_string()
            .contains("array"));
    }

    #[test]
    fn validates_view_status() {
        assert!(validate_status("draft").is_ok());
        assert!(validate_status("reviewed").is_ok());
        assert!(validate_status("confirmed").is_ok());
        assert!(validate_status("locked").is_err());
    }

    #[tokio::test]
    async fn json_rpc_updates_view_status_without_resending_a2ui() {
        let project = temp_project("status-update");
        let project_path = project.to_str().unwrap().to_string();
        ensure_project_layout(&project_path).unwrap();
        view_create_core(
            &project_path,
            json!({
                "title": "Subscription Flow",
                "status": "draft",
                "a2uiMessages": default_a2ui_messages("Subscription Flow")
            }),
        )
        .unwrap();

        let update_status = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "view.updateStatus",
            "params": {
                "viewPath": "subscription-flow.a2ui.json",
                "status": "confirmed"
            }
        });
        let response =
            handle_json_rpc_line_without_app(&project_path, &update_status.to_string()).await;

        assert_eq!(
            response["result"]["status"],
            Value::String("confirmed".to_string())
        );
        let view_file = views_path(&project_path).join("subscription-flow.a2ui.json");
        let doc: Value = serde_json::from_str(&fs::read_to_string(view_file).unwrap()).unwrap();
        assert_eq!(doc["status"], Value::String("confirmed".to_string()));
        assert_eq!(doc["a2uiMessages"].as_array().unwrap().len(), 2);
        assert_eq!(
            list_versions_for_view(&project_path, "subscription-flow.a2ui.json")
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn list_versions_returns_snapshots_newest_first() {
        let project = temp_project("versions");
        ensure_project_layout(project.to_str().unwrap()).unwrap();
        let view = views_path(project.to_str().unwrap()).join("flow.a2ui.json");
        write_json_file(&view, &json!({ "old": 1 })).unwrap();
        snapshot_version(project.to_str().unwrap(), "flow.a2ui.json", &view).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(2));
        fs::write(&view, "{}").unwrap();
        snapshot_version(project.to_str().unwrap(), "flow.a2ui.json", &view).unwrap();

        let versions = list_versions_for_view(project.to_str().unwrap(), "flow.a2ui.json").unwrap();

        assert_eq!(versions.len(), 2);
        assert!(versions[0].id > versions[1].id);
    }

    #[tokio::test]
    async fn json_rpc_socket_creates_updates_and_lists_versions() {
        let project = temp_project("socket");
        let project_path = project.to_str().unwrap().to_string();
        ensure_project_layout(&project_path).unwrap();
        let sock = std::env::temp_dir().join(format!("del-{}.sock", version_id()));
        let listener = UnixListener::bind(&sock).unwrap();

        let server_project = project_path.clone();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let (read, mut write) = stream.into_split();
            let mut lines = BufReader::new(read).lines();
            while let Some(line) = lines.next_line().await.unwrap() {
                let response = handle_json_rpc_line_without_app(&server_project, &line).await;
                write
                    .write_all(response.to_string().as_bytes())
                    .await
                    .unwrap();
                write.write_all(b"\n").await.unwrap();
            }
        });

        let stream = UnixStream::connect(&sock).await.unwrap();
        let (read, mut write) = stream.into_split();
        let mut lines = BufReader::new(read).lines();

        let create = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "view.create",
            "params": { "title": "Subscription Flow" }
        });
        write
            .write_all(create.to_string().as_bytes())
            .await
            .unwrap();
        write.write_all(b"\n").await.unwrap();
        let create_response: Value =
            serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
        assert_eq!(
            create_response["result"]["viewPath"],
            Value::String("subscription-flow.a2ui.json".to_string())
        );

        let update = json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "view.updateA2UI",
            "params": {
                "viewPath": "subscription-flow.a2ui.json",
                "a2uiMessages": default_a2ui_messages("Updated Subscription Flow")
            }
        });
        write
            .write_all(update.to_string().as_bytes())
            .await
            .unwrap();
        write.write_all(b"\n").await.unwrap();
        let update_response: Value =
            serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
        assert_eq!(
            update_response["result"]["viewPath"],
            Value::String("subscription-flow.a2ui.json".to_string())
        );

        let versions = json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "view.version.list",
            "params": { "viewPath": "subscription-flow.a2ui.json" }
        });
        write
            .write_all(versions.to_string().as_bytes())
            .await
            .unwrap();
        write.write_all(b"\n").await.unwrap();
        let versions_response: Value =
            serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
        assert_eq!(versions_response["result"].as_array().unwrap().len(), 1);

        let lenskits = json!({
            "jsonrpc": "2.0",
            "id": 4,
            "method": "lenskit.list",
            "params": {}
        });
        write
            .write_all(lenskits.to_string().as_bytes())
            .await
            .unwrap();
        write.write_all(b"\n").await.unwrap();
        let lenskits_response: Value =
            serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
        assert_eq!(
            lenskits_response["result"][0]["id"],
            Value::String("system".to_string())
        );

        let focus = json!({
            "jsonrpc": "2.0",
            "id": 5,
            "method": "workbench.window.focus",
            "params": {}
        });
        write.write_all(focus.to_string().as_bytes()).await.unwrap();
        write.write_all(b"\n").await.unwrap();
        let focus_response: Value =
            serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
        assert_eq!(focus_response["result"]["focused"], Value::Bool(true));

        drop(write);
        server.await.unwrap();
    }
}
