# A2UI + React Flow MVP — Design

**Date:** 2026-05-02
**Status:** Approved for planning
**Builds on:** `2026-05-01-delineation-mvp-skeleton-design.md` (assumes the skeleton has shipped)

## Goal

Close the loop **chat → Agent → A2UI → React Flow canvas**: the user types `分析 XXX 工作流` in a chat box, Delineation drives a local Claude Code subprocess via ACP, the agent reads code from the current Project, and emits an A2UI graph that renders as a flow chart on a React Flow canvas. The graph persists as a new `.a2ui.json` view.

## Acceptance scenario

User opens the Curation project in Delineation, creates a new canvas, types "分析用户点击订阅公众号会发生什么" in chat. After agent streaming completes, a flow chart of the workflow appears on the canvas, and a `.a2ui.json` view shows up in the sidebar. Reopening it later renders the cached graph without re-running the agent.

## Non-Goals

- Multi-turn refinement of an existing graph (next spec)
- Click-node-to-jump-to-code (next spec)
- MCP-based streaming graph deltas (deferred — MVP uses end-of-message JSON block)
- Gemini CLI integration (architecture leaves room; only Claude Code wired up)
- Embedded terminal panel
- Physics-simulation layout (dagre static layout only; no d3-force)
- Multiple agents per session, branch/compare, or undo

## Architecture

Three new layers on top of the MVP1 skeleton:

```
Frontend (React + Zustand)
├── Chat Panel        — message list + input, streams agent output
├── Canvas Viewer     — React Flow + dagre, renders A2UI graph
└── Iframe Viewer     — unchanged from MVP1, used for .html views

Tauri Rust
├── ACP Client        — spawns `claude` subprocess, JSON-RPC over stdio,
│                       relays prompts and assistant chunks
└── A2UI Parser       — extracts ```a2ui code block from final assistant
                        message, validates against schema, surfaces errors

Local subprocess (per session)
└── Claude Code CLI   — runs in Project working dir, uses its own tools to
                        read code; system prompt instructs it to end with an
                        ```a2ui``` JSON block describing the workflow graph
```

Delineation does not implement any code analysis itself — the agent's existing tooling (file read, grep, etc.) does the work. Delineation owns: chat I/O, ACP transport, prompt injection, response parsing, canvas rendering, persistence.

## A2UI v0.1 schema

Minimum viable. Mirrors the lean parts of Pallas's `PallasNode`; intentionally narrower so the parser is small.

```ts
interface A2UIGraph {
  meta: {
    version: '0.1'
    layoutMode: 'flow'              // only 'flow' in MVP
  }
  nodes: A2UINode[]
  edges: A2UIEdge[]
}

interface A2UINode {
  id: string                        // unique within the graph
  type: 'step'                      // only 'step' in MVP
  label: string                     // shown on the node
  payload?: {
    explanation?: string            // longer text shown on hover or in a side panel later
    codeRef?: { path: string; range: [number, number] }
  }
  positionHint?: {
    after?: string                  // logical predecessor node id (for sequencing)
  }
}

interface A2UIEdge {
  id: string
  from: string                      // node id
  to: string                        // node id
  label?: string                    // optional edge label
}
```

**Validation rules (parser must enforce):**
- `meta.version === '0.1'` and `meta.layoutMode === 'flow'`
- All `node.id` values are unique
- Every `edge.from` and `edge.to` references an existing node
- If `node.positionHint.after` is set, it references an existing node
- Layout (x/y coordinates) is **never** in the schema; the frontend computes it via dagre

## Agent contract

When the user starts a session, Tauri spawns `claude` with:
- Working directory = current Project root
- Standard ACP transport (JSON-RPC over stdio)
- A system prompt prepended to the conversation, content embedded in the Rust binary as a string constant. Approximate text:

> You are a code workflow analyzer for the Delineation tool. The user will ask you to analyze a workflow inside the current project (which you can read with your tools). Investigate using your normal tools (read files, grep, etc.). When your analysis is complete, your final assistant message MUST end with a fenced code block tagged `a2ui` containing JSON that conforms to A2UI v0.1: keys `meta`, `nodes`, `edges`. Each node has a unique id and a label. Edges reference node ids. Use `payload.codeRef` to point at source locations when relevant. The user's chat client will parse this block and render it as a flow chart. Do not include the JSON anywhere except the final fenced block.

The Rust parser scans the final assistant message for a ```a2ui ... ``` block (must be the last block in the message). On success, the parsed graph is pushed to the canvas and persisted. On failure, the chat displays a parse error and the canvas does not change.

## View file format

`.a2ui.json` is a new view type. The Sidebar already lists files in the Project root; we extend the filter to include both `.html` and `.a2ui.json`. ViewerPane dispatches by extension:

- `.html` → `<IframeViewer />` (existing)
- `.a2ui.json` → `<CanvasViewer />` (new)

The file's full content is the `A2UIGraph` JSON, pretty-printed with 2-space indent.

A new "+ New Canvas" button at the top of the sidebar creates an empty `Untitled.a2ui.json` (with valid empty graph: `{ meta: {version, layoutMode}, nodes: [], edges: [] }`), opens it as a tab, and focuses the chat input.

When the agent successfully emits a graph, Delineation:
1. Updates the canvas immediately (in-memory)
2. Writes the graph to the currently active `.a2ui.json` view file
3. Triggers a sidebar refresh so the new file shows up if it was just created

The chat history itself is not persisted in MVP — close the tab, lose the messages. Only the graph survives.

## UI layout (Project mode)

```
┌─ TopBar ───────────────────────────────────────────┐
├──────┬─────────────────────────────────────────────┤
│ Side │ TabStrip                                    │
│ bar  ├─────────────────────────────────────────────┤
│      │                                             │
│ + New│   Viewer (Iframe or Canvas, by extension)   │
│ Canvas│                                            │
│      │                                             │
│ ...  ├──────────── Chat Panel ─────────────────────┤
│      │  message list (scrolls)                     │
│      │  ──────────────────────                     │
│      │  > <input>                          [Send]  │
└──────┴─────────────────────────────────────────────┘
```

The Chat Panel is rendered only when the active tab is a `.a2ui.json` view. When the active tab is a `.html` view, the chat panel is hidden and the iframe takes the full viewer height (MVP1 behavior preserved).

## Frontend state

Three new Zustand stores in addition to the existing `useProjectStore`:

**`useChatStore`** (per-active-canvas; keyed by view filename)
- `sessions: Record<filename, { messages: Message[]; isStreaming: boolean; sessionId: string | null }>`
- `appendChunk(filename, chunk)` / `endStream(filename)` / `sendUserMessage(filename, text)` / `resetSession(filename)`
- `Message = { role: 'user' | 'assistant' | 'system'; text: string }`

**`useCanvasStore`** (per-active-canvas)
- `graphs: Record<filename, { graph: A2UIGraph | null; parseError: string | null }>`
- `setGraph(filename, graph)` / `setParseError(filename, msg)`

**No persistence** for the chat store. The canvas store mirrors what's on disk, written through `saveGraph` whenever the agent emits a valid graph.

## Tauri commands and events

**Commands (frontend → Rust):**
- `acp_start_session(project_path: string) -> session_id: string`
- `acp_send_prompt(session_id: string, text: string) -> ()`
- `acp_cancel(session_id: string) -> ()`

**Events (Rust → frontend):**
- `acp://chunk` — `{ session_id, role: 'assistant', delta: string }`
- `acp://turn-ended` — `{ session_id, success: bool, parse_error?: string }`
- `a2ui://graph` — `{ session_id, graph: A2UIGraph }` (only when parse succeeds)

The frontend sends one user message per `acp_send_prompt`. The Rust side runs the ACP turn, accumulates the agent's final assistant message, and on `turn-ended` runs the A2UI parser. On parse success it emits both `a2ui://graph` and `acp://turn-ended { success: true }`. On failure it emits `turn-ended { success: false, parse_error }`.

## React Flow integration

- Library: `@xyflow/react` + `@dagrejs/dagre`
- Custom node component `<StepNode>` showing `label` and (optionally) `payload.explanation` truncated.
- Layout: every time `graph` changes, run dagre top-to-bottom (`rankdir: 'TB'`, default node sizes), assign computed x/y to React Flow nodes.
- Edges: directed, with arrowhead. Show `edge.label` if present.
- Empty state: when `graph.nodes` is empty, show a placeholder message: "Type a prompt below to analyze a workflow."
- Pan/zoom enabled; node selection enabled; node dragging disabled in MVP (positions are dagre-computed, dragging would conflict).

## Rust ACP client

- Crate: `agent-client-protocol` (Zed's official Rust crate). If unavailable on crates.io, fall back to a minimal hand-rolled stdio JSON-RPC client (~150 LOC).
- Subprocess spawn: `claude --acp` (or whatever the actual flag is — verify against `claude --help` during implementation; the plan will pin the exact invocation).
- Working directory: the Project root passed in.
- The system prompt is prepended to the first user message (or via ACP's session-init mechanism if supported).
- Sessions tracked in a `Mutex<HashMap<String, SessionHandle>>` keyed by UUID. `SessionHandle` owns the child process, stdin handle, and a task pump that forwards stdout JSON-RPC messages to Tauri events.

## A2UI parser (Rust)

- Input: the agent's final assistant message text.
- Steps:
  1. Find the **last** ` ```a2ui ` fenced code block in the text.
  2. `serde_json::from_str` into an `A2UIGraph` struct.
  3. Run validation rules (above).
- On any failure, return `Err(ParseError { reason, raw_block })`. Frontend shows a friendly error in chat: "Agent did not produce a valid A2UI graph. (reason)" plus a collapsed view of the raw block.

## Tests

- **Rust unit (cargo test)**:
  - `a2ui::parse` happy path
  - `a2ui::parse` errors: missing block, malformed JSON, version mismatch, duplicate node ids, dangling edge, dangling `after`
- **Vitest**:
  - `useChatStore` actions: appendChunk accumulates, endStream toggles isStreaming, sendUserMessage appends user message
  - `useCanvasStore` actions: setGraph, setParseError mutual exclusion (graph clears error)
  - Viewer dispatch: extension `.html` → `IframeViewer`, `.a2ui.json` → `CanvasViewer`, others → "Unsupported"
- **Manual acceptance** (drives the spec's scenario):
  1. Open `~/Projects/Efficiency/Curation` (or any Curation variant) as Project
  2. Click "+ New Canvas" → empty canvas + chat panel appears
  3. Type "分析用户点击订阅公众号会发生什么" → send
  4. See streaming agent messages in chat
  5. After completion, see a flow chart on canvas with multiple steps
  6. Sidebar shows the new `.a2ui.json` view
  7. Close and reopen the tab → canvas re-renders cached graph

## File / module changes

```
app/src/
├── components/
│   ├── ChatPanel.tsx              (new)
│   ├── CanvasViewer.tsx           (new)  — React Flow host
│   ├── StepNode.tsx               (new)  — custom node
│   ├── ViewerPane.tsx             (modified) — dispatch by extension
│   ├── Sidebar.tsx                (modified) — "+ New Canvas" button, .a2ui.json filter
│   └── (existing components unchanged)
├── store/
│   ├── chatStore.ts               (new)
│   ├── chatStore.test.ts          (new)
│   ├── canvasStore.ts             (new)
│   └── canvasStore.test.ts        (new)
├── tauri/
│   ├── acp.ts                     (new) — frontend wrappers for acp_start_session etc.
│   └── fs.ts                      (modified) — listProjectViews returns .html ∪ .a2ui.json,
│                                              writeViewFile for saving graphs
├── canvas/
│   ├── layout.ts                  (new)  — dagre wrapper, graph → React Flow nodes/edges
│   └── layout.test.ts             (new)
├── a2ui/
│   ├── schema.ts                  (new)  — TS interface + zod (or hand-written) validator
│   └── schema.test.ts             (new)
└── App.tsx                        (modified) — wire chat panel + canvas

app/src-tauri/
├── src/
│   ├── lib.rs                     (modified) — register acp commands + events
│   ├── acp/
│   │   ├── mod.rs                 (new)
│   │   ├── client.rs              (new) — subprocess + JSON-RPC pump
│   │   └── prompts.rs             (new) — embedded system prompt
│   └── a2ui/
│       ├── mod.rs                 (new)
│       ├── schema.rs              (new) — serde-derive structs
│       └── parser.rs              (new) — extract block + validate
├── Cargo.toml                     (modified) — agent-client-protocol or stdio JSON-RPC deps,
│                                              uuid, regex
└── capabilities/default.json      (modified) — allow `shell:allow-execute` for `claude`,
                                                allow writing .a2ui.json under $HOME/**
```

## Out-of-scope reminders (do not let creep in)

- No view editor (graphs come from agent or hand-edited JSON via external editor)
- No agent picker UI (just `claude`; alternative agents are a TODO comment)
- No streaming canvas updates (one final graph per turn)
- No agent tool whitelist UI (whatever the user's Claude Code permissions are, that's what we get)
- No A2UI version negotiation (v0.1 hard-coded)
- No node click → jump to code (codeRef is captured but unused in UI)

## What this unlocks

- Streaming graph deltas via MCP (next spec)
- Click-to-jump-to-code via `payload.codeRef`
- Multi-turn refinement: "去掉支付那一步,加上风控" (next spec)
- Wiring Pallas's Python sidecar as an alternative analyzer (drop in a different ACP-or-RPC client behind the same A2UI surface)
- Composition mode: turn the chat box into a hypothesis input, dispatch multiple agents in parallel, compare outputs
