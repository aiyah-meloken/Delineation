# A2UI + React Flow MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the loop chat → ACP-driven Claude Code → A2UI v0.1 graph → React Flow canvas with dagre layout, persisted as `.a2ui.json` view files in the user's Project.

**Architecture:** Three new layers on top of the MVP1 skeleton: (1) a Rust ACP client that spawns and pumps a `claude` subprocess, parses agent output for an A2UI-tagged code block; (2) a React Flow canvas with dagre auto-layout; (3) a chat panel that drives sessions and streams agent messages. View files dispatch by extension — `.html` → existing iframe, `.a2ui.json` → new canvas.

**Tech Stack:** Tauri 2 · React 19 · TypeScript · Zustand · Vitest · `@xyflow/react` · `@dagrejs/dagre` · `agent-client-protocol` (Rust crate from Zed) · serde · tokio · uuid

**Builds on:** MVP1 skeleton (commits up to `4173cca`). All paths below are relative to `/Users/zhuhuifeng/Projects/Delineation-Workspace/app/` unless prefixed otherwise.

---

## File Structure

New / modified files this plan produces:

```
app/
├── src/
│   ├── a2ui/
│   │   ├── schema.ts                  (new) TS interfaces + type-guard validator
│   │   └── schema.test.ts             (new)
│   ├── canvas/
│   │   ├── layout.ts                  (new) dagre wrapper: A2UIGraph → ReactFlow nodes/edges
│   │   └── layout.test.ts             (new)
│   ├── store/
│   │   ├── chatStore.ts               (new)
│   │   ├── chatStore.test.ts          (new)
│   │   ├── canvasStore.ts             (new)
│   │   └── canvasStore.test.ts        (new)
│   ├── tauri/
│   │   ├── acp.ts                     (new) frontend wrappers for acp_* commands + events
│   │   └── fs.ts                      (modified) listProjectViews, writeViewFile
│   ├── components/
│   │   ├── ChatPanel.tsx              (new)
│   │   ├── CanvasViewer.tsx           (new)
│   │   ├── StepNode.tsx               (new)
│   │   ├── ViewerPane.tsx             (modified) dispatch by extension
│   │   ├── Sidebar.tsx                (modified) extension filter + New Canvas button
│   │   └── (others unchanged)
│   ├── App.tsx                        (modified) wire chat panel + canvas
│   └── styles.css                     (modified) chat + canvas + StepNode styles
└── src-tauri/
    ├── Cargo.toml                     (modified) add agent-client-protocol, tokio, uuid, regex, serde_with
    ├── src/
    │   ├── lib.rs                     (modified) register acp commands + events; init AcpState
    │   ├── acp/
    │   │   ├── mod.rs                 (new)
    │   │   ├── client.rs              (new) ACP session manager, prompt pump
    │   │   └── prompts.rs             (new) embedded system prompt
    │   └── a2ui/
    │       ├── mod.rs                 (new)
    │       ├── schema.rs              (new) serde structs
    │       └── parser.rs              (new) extract+validate ```a2ui block
    └── capabilities/default.json      (unchanged — no new capability required for custom commands)
```

---

## Task 1: A2UI TypeScript schema and type-guard

**Files:**
- Create: `app/src/a2ui/schema.ts`
- Create: `app/src/a2ui/schema.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/src/a2ui/schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isValidA2UIGraph, emptyGraph, type A2UIGraph } from './schema'

describe('isValidA2UIGraph', () => {
  it('accepts a minimal valid graph', () => {
    const g: A2UIGraph = { meta: { version: '0.1', layoutMode: 'flow' }, nodes: [], edges: [] }
    expect(isValidA2UIGraph(g).ok).toBe(true)
  })

  it('rejects wrong version', () => {
    const r = isValidA2UIGraph({ meta: { version: '0.2', layoutMode: 'flow' }, nodes: [], edges: [] })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/version/i)
  })

  it('rejects duplicate node ids', () => {
    const r = isValidA2UIGraph({
      meta: { version: '0.1', layoutMode: 'flow' },
      nodes: [
        { id: 'a', type: 'step', label: 'A' },
        { id: 'a', type: 'step', label: 'A2' },
      ],
      edges: [],
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/duplicate/i)
  })

  it('rejects edge with unknown endpoint', () => {
    const r = isValidA2UIGraph({
      meta: { version: '0.1', layoutMode: 'flow' },
      nodes: [{ id: 'a', type: 'step', label: 'A' }],
      edges: [{ id: 'e1', from: 'a', to: 'b' }],
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/edge/i)
  })

  it('rejects positionHint.after referencing missing node', () => {
    const r = isValidA2UIGraph({
      meta: { version: '0.1', layoutMode: 'flow' },
      nodes: [{ id: 'a', type: 'step', label: 'A', positionHint: { after: 'b' } }],
      edges: [],
    })
    expect(r.ok).toBe(false)
  })

  it('rejects non-object input', () => {
    expect(isValidA2UIGraph(null).ok).toBe(false)
    expect(isValidA2UIGraph('hi').ok).toBe(false)
  })
})

describe('emptyGraph', () => {
  it('returns a valid empty graph', () => {
    const g = emptyGraph()
    expect(isValidA2UIGraph(g).ok).toBe(true)
    expect(g.nodes).toEqual([])
    expect(g.edges).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace/app
npm test -- a2ui/schema.test
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement schema and validator**

Create `app/src/a2ui/schema.ts`:
```ts
export interface A2UIGraph {
  meta: { version: '0.1'; layoutMode: 'flow' }
  nodes: A2UINode[]
  edges: A2UIEdge[]
}

export interface A2UINode {
  id: string
  type: 'step'
  label: string
  payload?: {
    explanation?: string
    codeRef?: { path: string; range: [number, number] }
  }
  positionHint?: { after?: string }
}

export interface A2UIEdge {
  id: string
  from: string
  to: string
  label?: string
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string }

export function emptyGraph(): A2UIGraph {
  return { meta: { version: '0.1', layoutMode: 'flow' }, nodes: [], edges: [] }
}

export function isValidA2UIGraph(value: unknown): ValidationResult {
  if (typeof value !== 'object' || value === null) return { ok: false, reason: 'not an object' }
  const v = value as Record<string, unknown>

  const meta = v.meta as Record<string, unknown> | undefined
  if (!meta || meta.version !== '0.1') return { ok: false, reason: 'unsupported version (expected 0.1)' }
  if (meta.layoutMode !== 'flow') return { ok: false, reason: 'unsupported layoutMode (expected flow)' }

  if (!Array.isArray(v.nodes)) return { ok: false, reason: 'nodes must be an array' }
  if (!Array.isArray(v.edges)) return { ok: false, reason: 'edges must be an array' }

  const nodeIds = new Set<string>()
  for (const n of v.nodes as Array<Record<string, unknown>>) {
    if (typeof n.id !== 'string' || !n.id) return { ok: false, reason: 'node missing id' }
    if (n.type !== 'step') return { ok: false, reason: `unknown node type ${String(n.type)}` }
    if (typeof n.label !== 'string') return { ok: false, reason: `node ${n.id} missing label` }
    if (nodeIds.has(n.id)) return { ok: false, reason: `duplicate node id ${n.id}` }
    nodeIds.add(n.id)
  }

  // Check positionHint references after node ids are collected
  for (const n of v.nodes as Array<Record<string, unknown>>) {
    const hint = n.positionHint as Record<string, unknown> | undefined
    if (hint?.after !== undefined) {
      if (typeof hint.after !== 'string' || !nodeIds.has(hint.after)) {
        return { ok: false, reason: `node ${n.id} positionHint.after references unknown node ${String(hint.after)}` }
      }
    }
  }

  for (const e of v.edges as Array<Record<string, unknown>>) {
    if (typeof e.id !== 'string' || !e.id) return { ok: false, reason: 'edge missing id' }
    if (typeof e.from !== 'string' || !nodeIds.has(e.from)) return { ok: false, reason: `edge ${e.id} references unknown from ${String(e.from)}` }
    if (typeof e.to !== 'string' || !nodeIds.has(e.to)) return { ok: false, reason: `edge ${e.id} references unknown to ${String(e.to)}` }
  }

  return { ok: true }
}
```

- [ ] **Step 4: Run tests — verify pass**

```
npm test -- a2ui/schema.test
```
Expected: 7 passing.

- [ ] **Step 5: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/a2ui/
git commit -m "feat(a2ui): add v0.1 schema and validator"
```

---

## Task 2: dagre layout wrapper

**Files:**
- Create: `app/src/canvas/layout.ts`
- Create: `app/src/canvas/layout.test.ts`

- [ ] **Step 1: Install dagre and React Flow**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace/app
npm install @xyflow/react @dagrejs/dagre
npm install -D @types/dagre
```

(`@dagrejs/dagre` ships its own types in current versions; the `@types/dagre` install is harmless if redundant — proceed regardless of warnings.)

- [ ] **Step 2: Write failing tests**

Create `app/src/canvas/layout.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { layoutGraph } from './layout'
import type { A2UIGraph } from '../a2ui/schema'

const graph: A2UIGraph = {
  meta: { version: '0.1', layoutMode: 'flow' },
  nodes: [
    { id: 'a', type: 'step', label: 'A' },
    { id: 'b', type: 'step', label: 'B' },
  ],
  edges: [{ id: 'e1', from: 'a', to: 'b' }],
}

describe('layoutGraph', () => {
  it('produces one ReactFlow node per A2UI node with x/y positions', () => {
    const { nodes } = layoutGraph(graph)
    expect(nodes).toHaveLength(2)
    expect(nodes[0].id).toBe('a')
    expect(nodes[0].position.x).toBeTypeOf('number')
    expect(nodes[0].position.y).toBeTypeOf('number')
    expect(nodes[0].data.label).toBe('A')
    expect(nodes[0].type).toBe('step')
  })

  it('positions nodes top-down (b below a)', () => {
    const { nodes } = layoutGraph(graph)
    const a = nodes.find((n) => n.id === 'a')!
    const b = nodes.find((n) => n.id === 'b')!
    expect(b.position.y).toBeGreaterThan(a.position.y)
  })

  it('produces ReactFlow edges with marker', () => {
    const { edges } = layoutGraph(graph)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ id: 'e1', source: 'a', target: 'b' })
    expect(edges[0].markerEnd).toBeDefined()
  })

  it('handles empty graphs', () => {
    const empty: A2UIGraph = { meta: { version: '0.1', layoutMode: 'flow' }, nodes: [], edges: [] }
    const { nodes, edges } = layoutGraph(empty)
    expect(nodes).toEqual([])
    expect(edges).toEqual([])
  })

  it('passes edge label through', () => {
    const g: A2UIGraph = { ...graph, edges: [{ id: 'e1', from: 'a', to: 'b', label: 'next' }] }
    const { edges } = layoutGraph(g)
    expect(edges[0].label).toBe('next')
  })
})
```

- [ ] **Step 3: Run — verify fail**

```
npm test -- canvas/layout.test
```
Expected: module not found.

- [ ] **Step 4: Implement**

Create `app/src/canvas/layout.ts`:
```ts
import dagre from '@dagrejs/dagre'
import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { A2UIGraph } from '../a2ui/schema'

const NODE_WIDTH = 180
const NODE_HEIGHT = 56

export interface StepNodeData extends Record<string, unknown> {
  label: string
  explanation?: string
}

export interface LayoutResult {
  nodes: Node<StepNodeData>[]
  edges: Edge[]
}

export function layoutGraph(graph: A2UIGraph): LayoutResult {
  if (graph.nodes.length === 0) return { nodes: [], edges: [] }

  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const n of graph.nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const e of graph.edges) {
    g.setEdge(e.from, e.to)
  }
  // Treat positionHint.after as an extra edge so dagre orders accordingly.
  for (const n of graph.nodes) {
    if (n.positionHint?.after) g.setEdge(n.positionHint.after, n.id)
  }

  dagre.layout(g)

  const nodes: Node<StepNodeData>[] = graph.nodes.map((n) => {
    const pos = g.node(n.id)
    return {
      id: n.id,
      type: 'step',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: { label: n.label, explanation: n.payload?.explanation },
    }
  })

  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    label: e.label,
    markerEnd: { type: MarkerType.ArrowClosed },
  }))

  return { nodes, edges }
}
```

- [ ] **Step 5: Run — verify pass**

```
npm test -- canvas/layout.test
```
Expected: 5 passing.

- [ ] **Step 6: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/canvas/ app/package.json app/package-lock.json
git commit -m "feat(canvas): add dagre layout wrapper for A2UI graphs"
```

---

## Task 3: chatStore (Zustand, TDD)

**Files:**
- Create: `app/src/store/chatStore.ts`
- Create: `app/src/store/chatStore.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/src/store/chatStore.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from './chatStore'

describe('chatStore', () => {
  beforeEach(() => {
    useChatStore.getState().reset()
  })

  it('initial: no sessions', () => {
    expect(useChatStore.getState().sessions).toEqual({})
  })

  it('appendUserMessage starts a fresh session for unknown filename', () => {
    useChatStore.getState().appendUserMessage('Untitled.a2ui.json', 'analyze auth')
    const s = useChatStore.getState().sessions['Untitled.a2ui.json']
    expect(s.messages).toEqual([{ role: 'user', text: 'analyze auth' }])
    expect(s.isStreaming).toBe(true)
    expect(s.parseError).toBeNull()
  })

  it('appendAssistantChunk appends or extends the trailing assistant message', () => {
    const f = 'x.a2ui.json'
    const s = useChatStore.getState()
    s.appendUserMessage(f, 'hi')
    s.appendAssistantChunk(f, 'hel')
    s.appendAssistantChunk(f, 'lo')
    const msgs = useChatStore.getState().sessions[f].messages
    expect(msgs).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello' },
    ])
  })

  it('endTurn clears isStreaming and optionally records parseError', () => {
    const f = 'x.a2ui.json'
    const s = useChatStore.getState()
    s.appendUserMessage(f, 'hi')
    s.appendAssistantChunk(f, 'reply')
    s.endTurn(f, { success: false, parseError: 'no a2ui block' })
    const sess = useChatStore.getState().sessions[f]
    expect(sess.isStreaming).toBe(false)
    expect(sess.parseError).toBe('no a2ui block')
  })

  it('endTurn success clears any prior parseError', () => {
    const f = 'x.a2ui.json'
    const s = useChatStore.getState()
    s.appendUserMessage(f, 'hi')
    s.endTurn(f, { success: false, parseError: 'oops' })
    s.appendUserMessage(f, 'try again')
    s.endTurn(f, { success: true })
    expect(useChatStore.getState().sessions[f].parseError).toBeNull()
  })

  it('discardSession removes the entry', () => {
    const f = 'x.a2ui.json'
    useChatStore.getState().appendUserMessage(f, 'hi')
    useChatStore.getState().discardSession(f)
    expect(useChatStore.getState().sessions[f]).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — verify fail**

```
npm test -- store/chatStore.test
```

- [ ] **Step 3: Implement**

Create `app/src/store/chatStore.ts`:
```ts
import { create } from 'zustand'

export type ChatRole = 'user' | 'assistant'
export interface ChatMessage {
  role: ChatRole
  text: string
}

export interface ChatSession {
  messages: ChatMessage[]
  isStreaming: boolean
  parseError: string | null
}

interface State {
  sessions: Record<string, ChatSession>
  appendUserMessage: (filename: string, text: string) => void
  appendAssistantChunk: (filename: string, delta: string) => void
  endTurn: (filename: string, result: { success: boolean; parseError?: string }) => void
  discardSession: (filename: string) => void
  reset: () => void
}

const blankSession = (): ChatSession => ({ messages: [], isStreaming: false, parseError: null })

export const useChatStore = create<State>((set) => ({
  sessions: {},

  appendUserMessage: (filename, text) =>
    set((state) => {
      const prev = state.sessions[filename] ?? blankSession()
      return {
        sessions: {
          ...state.sessions,
          [filename]: {
            messages: [...prev.messages, { role: 'user', text }],
            isStreaming: true,
            parseError: prev.parseError,
          },
        },
      }
    }),

  appendAssistantChunk: (filename, delta) =>
    set((state) => {
      const prev = state.sessions[filename] ?? blankSession()
      const last = prev.messages[prev.messages.length - 1]
      const messages =
        last && last.role === 'assistant'
          ? [...prev.messages.slice(0, -1), { role: 'assistant' as const, text: last.text + delta }]
          : [...prev.messages, { role: 'assistant' as const, text: delta }]
      return { sessions: { ...state.sessions, [filename]: { ...prev, messages } } }
    }),

  endTurn: (filename, result) =>
    set((state) => {
      const prev = state.sessions[filename] ?? blankSession()
      return {
        sessions: {
          ...state.sessions,
          [filename]: {
            ...prev,
            isStreaming: false,
            parseError: result.success ? null : (result.parseError ?? 'unknown error'),
          },
        },
      }
    }),

  discardSession: (filename) =>
    set((state) => {
      const next = { ...state.sessions }
      delete next[filename]
      return { sessions: next }
    }),

  reset: () => set({ sessions: {} }),
}))
```

- [ ] **Step 4: Run — verify pass**

```
npm test -- store/chatStore.test
```
Expected: 6 passing.

- [ ] **Step 5: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/store/chatStore.ts app/src/store/chatStore.test.ts
git commit -m "feat(store): add chatStore for per-canvas chat sessions"
```

---

## Task 4: canvasStore (Zustand, TDD)

**Files:**
- Create: `app/src/store/canvasStore.ts`
- Create: `app/src/store/canvasStore.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/src/store/canvasStore.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore } from './canvasStore'
import { emptyGraph, type A2UIGraph } from '../a2ui/schema'

const sample: A2UIGraph = {
  meta: { version: '0.1', layoutMode: 'flow' },
  nodes: [{ id: 'a', type: 'step', label: 'A' }],
  edges: [],
}

describe('canvasStore', () => {
  beforeEach(() => useCanvasStore.getState().reset())

  it('returns null graph for unknown filename', () => {
    expect(useCanvasStore.getState().getGraph('x.a2ui.json')).toBeNull()
  })

  it('setGraph stores per filename', () => {
    useCanvasStore.getState().setGraph('a.a2ui.json', sample)
    expect(useCanvasStore.getState().getGraph('a.a2ui.json')).toEqual(sample)
    expect(useCanvasStore.getState().getGraph('b.a2ui.json')).toBeNull()
  })

  it('setGraph replaces and accepts emptyGraph', () => {
    const f = 'a.a2ui.json'
    useCanvasStore.getState().setGraph(f, sample)
    useCanvasStore.getState().setGraph(f, emptyGraph())
    expect(useCanvasStore.getState().getGraph(f)?.nodes).toEqual([])
  })

  it('discard removes the entry', () => {
    const f = 'a.a2ui.json'
    useCanvasStore.getState().setGraph(f, sample)
    useCanvasStore.getState().discard(f)
    expect(useCanvasStore.getState().getGraph(f)).toBeNull()
  })
})
```

- [ ] **Step 2: Run — verify fail**

```
npm test -- store/canvasStore.test
```

- [ ] **Step 3: Implement**

Create `app/src/store/canvasStore.ts`:
```ts
import { create } from 'zustand'
import type { A2UIGraph } from '../a2ui/schema'

interface State {
  graphs: Record<string, A2UIGraph>
  getGraph: (filename: string) => A2UIGraph | null
  setGraph: (filename: string, graph: A2UIGraph) => void
  discard: (filename: string) => void
  reset: () => void
}

export const useCanvasStore = create<State>((set, get) => ({
  graphs: {},
  getGraph: (filename) => get().graphs[filename] ?? null,
  setGraph: (filename, graph) =>
    set((s) => ({ graphs: { ...s.graphs, [filename]: graph } })),
  discard: (filename) =>
    set((s) => {
      const next = { ...s.graphs }
      delete next[filename]
      return { graphs: next }
    }),
  reset: () => set({ graphs: {} }),
}))
```

- [ ] **Step 4: Run — verify pass**

```
npm test -- store/canvasStore.test
```
Expected: 4 passing.

- [ ] **Step 5: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/store/canvasStore.ts app/src/store/canvasStore.test.ts
git commit -m "feat(store): add canvasStore for per-filename A2UI graphs"
```

---

## Task 5: A2UI Rust schema (serde)

**Files:**
- Create: `app/src-tauri/src/a2ui/mod.rs`
- Create: `app/src-tauri/src/a2ui/schema.rs`

- [ ] **Step 1: Add serde_json (already a dep) — confirm**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace/app/src-tauri
grep '^serde' Cargo.toml
```
Expected: `serde` and `serde_json` both listed.

- [ ] **Step 2: Create the module skeleton**

Create `app/src-tauri/src/a2ui/mod.rs`:
```rust
pub mod parser;
pub mod schema;

pub use parser::{parse_a2ui_block, ParseError};
pub use schema::{A2UIEdge, A2UIGraph, A2UINode, Meta};
```

Create `app/src-tauri/src/a2ui/schema.rs`:
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct A2UIGraph {
    pub meta: Meta,
    pub nodes: Vec<A2UINode>,
    pub edges: Vec<A2UIEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub version: String,
    pub layout_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct A2UINode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payload: Option<NodePayload>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub position_hint: Option<PositionHint>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NodePayload {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub explanation: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub code_ref: Option<CodeRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CodeRef {
    pub path: String,
    pub range: [u32; 2],
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PositionHint {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub after: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct A2UIEdge {
    pub id: String,
    pub from: String,
    pub to: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub label: Option<String>,
}
```

- [ ] **Step 3: Wire the module into lib.rs**

Open `app/src-tauri/src/lib.rs`. Near the top, add:
```rust
mod a2ui;
```
(Place after any existing `mod` declarations or right after `use` block — anywhere top-level.)

- [ ] **Step 4: Verify it compiles**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace/app/src-tauri
cargo check 2>&1 | tail -5
```
Expected: `Finished` with no errors. (You'll see warnings about `parser` being missing — that's OK; we add it next task.)

Wait — `mod.rs` declares `pub mod parser;`. That will fail compilation because `parser.rs` doesn't exist yet. Two options:

(a) Comment out `pub mod parser;` and `pub use parser::...;` for now and uncomment in Task 6.
(b) Create a stub `parser.rs` with placeholder content.

Choose (b). Create `app/src-tauri/src/a2ui/parser.rs`:
```rust
// stub — populated in Task 6
#[derive(Debug)]
pub struct ParseError(pub String);

pub fn parse_a2ui_block(_text: &str) -> Result<crate::a2ui::A2UIGraph, ParseError> {
    Err(ParseError("not implemented".into()))
}
```

Now re-run:
```
cargo check 2>&1 | tail -3
```
Expected: Finished, no errors.

- [ ] **Step 5: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src-tauri/src/a2ui/ app/src-tauri/src/lib.rs
git commit -m "feat(a2ui): add Rust serde structs for A2UI v0.1 graph"
```

---

## Task 6: A2UI parser (Rust, TDD)

**Files:**
- Modify: `app/src-tauri/src/a2ui/parser.rs`
- Modify: `app/src-tauri/Cargo.toml` (add `regex`)

- [ ] **Step 1: Add regex dep**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace/app/src-tauri
cargo add regex
```

- [ ] **Step 2: Write failing tests**

Replace the stub `parser.rs` contents with the test scaffold first (TDD red):

`app/src-tauri/src/a2ui/parser.rs`:
```rust
use crate::a2ui::schema::A2UIGraph;
use regex::Regex;
use serde_json;
use std::collections::HashSet;

#[derive(Debug, PartialEq)]
pub struct ParseError(pub String);

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

pub fn parse_a2ui_block(_text: &str) -> Result<A2UIGraph, ParseError> {
    Err(ParseError("not implemented".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID: &str = r#"
analysis text...

```a2ui
{
  "meta": { "version": "0.1", "layoutMode": "flow" },
  "nodes": [
    { "id": "a", "type": "step", "label": "Step A" },
    { "id": "b", "type": "step", "label": "Step B" }
  ],
  "edges": [
    { "id": "e1", "from": "a", "to": "b" }
  ]
}
```
"#;

    #[test]
    fn parses_valid_block() {
        let g = parse_a2ui_block(VALID).expect("should parse");
        assert_eq!(g.nodes.len(), 2);
        assert_eq!(g.edges.len(), 1);
        assert_eq!(g.meta.version, "0.1");
        assert_eq!(g.meta.layout_mode, "flow");
    }

    #[test]
    fn picks_last_a2ui_block_when_multiple() {
        let text = r#"
```a2ui
{ "meta": { "version": "0.1", "layoutMode": "flow" }, "nodes": [], "edges": [] }
```
some prose
```a2ui
{ "meta": { "version": "0.1", "layoutMode": "flow" },
  "nodes": [{ "id": "x", "type": "step", "label": "X" }],
  "edges": [] }
```
"#;
        let g = parse_a2ui_block(text).expect("should parse");
        assert_eq!(g.nodes.len(), 1);
        assert_eq!(g.nodes[0].id, "x");
    }

    #[test]
    fn errors_when_no_block() {
        let err = parse_a2ui_block("just prose, no graph").unwrap_err();
        assert!(err.0.to_lowercase().contains("no a2ui block"));
    }

    #[test]
    fn errors_on_bad_json() {
        let text = "```a2ui\n{ not json }\n```";
        let err = parse_a2ui_block(text).unwrap_err();
        assert!(err.0.to_lowercase().contains("json"));
    }

    #[test]
    fn errors_on_wrong_version() {
        let text = r#"
```a2ui
{ "meta": { "version": "0.2", "layoutMode": "flow" }, "nodes": [], "edges": [] }
```
"#;
        let err = parse_a2ui_block(text).unwrap_err();
        assert!(err.0.to_lowercase().contains("version"));
    }

    #[test]
    fn errors_on_duplicate_node_id() {
        let text = r#"
```a2ui
{ "meta": { "version": "0.1", "layoutMode": "flow" },
  "nodes": [
    { "id": "a", "type": "step", "label": "A" },
    { "id": "a", "type": "step", "label": "A2" }
  ], "edges": [] }
```
"#;
        let err = parse_a2ui_block(text).unwrap_err();
        assert!(err.0.to_lowercase().contains("duplicate"));
    }

    #[test]
    fn errors_on_dangling_edge() {
        let text = r#"
```a2ui
{ "meta": { "version": "0.1", "layoutMode": "flow" },
  "nodes": [{ "id": "a", "type": "step", "label": "A" }],
  "edges": [{ "id": "e", "from": "a", "to": "missing" }] }
```
"#;
        let err = parse_a2ui_block(text).unwrap_err();
        assert!(err.0.to_lowercase().contains("missing") || err.0.to_lowercase().contains("unknown"));
    }
}
```

- [ ] **Step 3: Run — verify fail**

```
cargo test --lib a2ui::parser 2>&1 | tail -20
```
Expected: 7 tests, all fail with "not implemented".

- [ ] **Step 4: Implement parser**

Replace the body of `parse_a2ui_block` (and add helpers) in the same file:
```rust
pub fn parse_a2ui_block(text: &str) -> Result<A2UIGraph, ParseError> {
    let re = Regex::new(r"(?s)```a2ui\s*\n(.*?)\n```")
        .map_err(|e| ParseError(format!("regex compile: {e}")))?;

    let captures: Vec<_> = re.captures_iter(text).collect();
    let last = captures
        .last()
        .ok_or_else(|| ParseError("no a2ui block found in agent output".into()))?;
    let body = last
        .get(1)
        .map(|m| m.as_str())
        .ok_or_else(|| ParseError("no a2ui block content".into()))?;

    let graph: A2UIGraph = serde_json::from_str(body)
        .map_err(|e| ParseError(format!("invalid json in a2ui block: {e}")))?;

    validate(&graph)?;
    Ok(graph)
}

fn validate(g: &A2UIGraph) -> Result<(), ParseError> {
    if g.meta.version != "0.1" {
        return Err(ParseError(format!(
            "unsupported version {} (expected 0.1)",
            g.meta.version
        )));
    }
    if g.meta.layout_mode != "flow" {
        return Err(ParseError(format!(
            "unsupported layoutMode {} (expected flow)",
            g.meta.layout_mode
        )));
    }

    let mut ids: HashSet<&str> = HashSet::new();
    for n in &g.nodes {
        if n.node_type != "step" {
            return Err(ParseError(format!(
                "unknown node type '{}' on node {}",
                n.node_type, n.id
            )));
        }
        if !ids.insert(&n.id) {
            return Err(ParseError(format!("duplicate node id '{}'", n.id)));
        }
    }

    for n in &g.nodes {
        if let Some(hint) = &n.position_hint {
            if let Some(after) = &hint.after {
                if !ids.contains(after.as_str()) {
                    return Err(ParseError(format!(
                        "node '{}' positionHint.after references missing node '{}'",
                        n.id, after
                    )));
                }
            }
        }
    }

    for e in &g.edges {
        if !ids.contains(e.from.as_str()) {
            return Err(ParseError(format!(
                "edge '{}' references missing node '{}' as from",
                e.id, e.from
            )));
        }
        if !ids.contains(e.to.as_str()) {
            return Err(ParseError(format!(
                "edge '{}' references missing node '{}' as to",
                e.id, e.to
            )));
        }
    }

    Ok(())
}
```

- [ ] **Step 5: Run — verify pass**

```
cargo test --lib a2ui::parser 2>&1 | tail -15
```
Expected: 7 passing.

- [ ] **Step 6: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src-tauri/src/a2ui/parser.rs app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock
git commit -m "feat(a2ui): add Rust parser for tagged code block + validator"
```

---

## Task 7: Embedded system prompt

**Files:**
- Create: `app/src-tauri/src/acp/mod.rs`
- Create: `app/src-tauri/src/acp/prompts.rs`

- [ ] **Step 1: Create module skeleton**

Create `app/src-tauri/src/acp/mod.rs`:
```rust
pub mod client;
pub mod prompts;
```

Create `app/src-tauri/src/acp/prompts.rs`:
```rust
/// System prompt prepended to every Delineation ACP session.
/// The agent must end its final assistant message with a fenced code block
/// tagged `a2ui` containing a JSON document conforming to the A2UI v0.1 schema.
pub const SYSTEM_PROMPT: &str = r#"
You are a code workflow analyzer working inside the Delineation tool.

The user will ask you to analyze a workflow or behavior in the current project.
Your working directory is the project root; you may use your standard file-read,
grep, and search tools to investigate the code.

When your analysis is complete, your **final assistant message** MUST end with a
fenced code block tagged `a2ui` containing JSON that conforms to A2UI v0.1.

Schema:
- meta: { "version": "0.1", "layoutMode": "flow" }
- nodes: array of { id (unique string), type: "step", label (short text),
                   payload (optional: explanation, codeRef { path, range:[start,end] }),
                   positionHint (optional: { after: <node id> }) }
- edges: array of { id (unique string), from (node id), to (node id),
                    label (optional short text) }

Rules:
- Do NOT include x/y coordinates. The client computes layout.
- Use one node per meaningful step. Aim for under 20 nodes total.
- Use `payload.codeRef.path` (project-relative) plus `range` (line numbers,
  start and end inclusive) to point at the source for each step when possible.
- Keep `label` short (under 40 characters); put longer descriptions in
  `payload.explanation`.
- The fenced code block MUST be the last block of your final message. Do not
  emit the JSON anywhere else.
"#;
```

- [ ] **Step 2: Stub `client.rs` so the module compiles**

Create `app/src-tauri/src/acp/client.rs`:
```rust
// Populated in Task 8.
```

- [ ] **Step 3: Wire into lib.rs**

In `app/src-tauri/src/lib.rs`, add (after other `mod` lines):
```rust
mod acp;
```

- [ ] **Step 4: Verify compiles**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace/app/src-tauri
cargo check 2>&1 | tail -3
```
Expected: Finished, no errors. (May warn about unused `SYSTEM_PROMPT`; ignore.)

- [ ] **Step 5: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src-tauri/src/acp/ app/src-tauri/src/lib.rs
git commit -m "feat(acp): scaffold acp module + embed system prompt"
```

---

## Task 8: ACP client (Rust subprocess + JSON-RPC pump)

**Files:**
- Modify: `app/src-tauri/Cargo.toml` (add `agent-client-protocol`, `tokio` features, `uuid`, `anyhow`, `tokio-util`)
- Modify: `app/src-tauri/src/acp/client.rs`
- Modify: `app/src-tauri/src/lib.rs` (commands + state)

> **Engineer note (corrected after CLI inspection):** Claude Code 2.1.x does **not** speak ACP natively — it speaks its own `stream-json` protocol. To bridge, we spawn the **`@zed-industries/claude-code-acp` adapter** (an npm package, currently v0.16.2), which internally launches `claude` and exposes an ACP-speaking stdio interface. Tauri's Rust side uses the [`agent-client-protocol` crate](https://crates.io/crates/agent-client-protocol) to drive the adapter. Read both the crate README and `npm view @zed-industries/claude-code-acp` before starting; adapt the calls below if either API has shifted by the time you implement. The adapter and `claude` CLI must both be installed on the user's machine (manual acceptance Task 18 verifies).

- [ ] **Step 1: Add deps**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace/app/src-tauri
cargo add agent-client-protocol
cargo add tokio --features full
cargo add uuid --features v4
cargo add anyhow
cargo add async-trait
```

- [ ] **Step 2: Verify adapter availability**

```
which claude
claude --version
npm view @zed-industries/claude-code-acp version
```
Expected: `claude` resolves (Claude Code installed); npm view prints a version string (the adapter package exists and `npx` can fetch it). The actual adapter is launched via `npx -y @zed-industries/claude-code-acp@<version>`.

- [ ] **Step 3: Implement `client.rs`**

Replace `app/src-tauri/src/acp/client.rs` with:
```rust
use anyhow::{anyhow, Context, Result};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::a2ui::{parse_a2ui_block, A2UIGraph};
use crate::acp::prompts::SYSTEM_PROMPT;

/// Adapter argv. We spawn the Zed-published claude-code-acp adapter via npx.
/// The adapter internally spawns `claude` and exposes ACP over stdio.
/// Pinning the version keeps behavior reproducible across machines.
pub const ADAPTER_ARGV: &[&str] = &["npx", "-y", "@zed-industries/claude-code-acp@0.16"];

/// Public types emitted to the frontend via Tauri events.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ChunkEvent {
    pub session_id: String,
    pub delta: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TurnEndedEvent {
    pub session_id: String,
    pub success: bool,
    pub parse_error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GraphEvent {
    pub session_id: String,
    pub graph: A2UIGraph,
}

/// Per-session handle holding the ACP client + accumulated assistant text for the in-flight turn.
struct Session {
    /// Holds the live ACP client/connection handle from the agent-client-protocol crate.
    /// Type is opaque here; concrete type comes from the crate API. Use whatever the crate provides
    /// (e.g., `Client` or `AgentConnection`) and store it boxed inside an Arc<Mutex<_>>.
    /// Project working directory for this session.
    project_path: String,
    /// Accumulator for the current turn's assistant text.
    accumulator: String,
}

#[derive(Default)]
pub struct AcpState {
    sessions: Mutex<HashMap<String, Arc<Mutex<Session>>>>,
}

impl AcpState {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Start a new session. Spawns the agent subprocess in `project_path`, performs the ACP
/// initialize handshake, and returns a session id used for all subsequent calls.
pub async fn start_session(app: AppHandle, project_path: String) -> Result<String> {
    let state = app.state::<AcpState>();
    let session_id = Uuid::new_v4().to_string();

    // 1) Spawn the subprocess.
    //    Construct a tokio::process::Command using ADAPTER_ARGV[0] as the program
    //    and ADAPTER_ARGV[1..] as args. Set current_dir(&project_path),
    //    stdin/stdout/stderr piped.
    //
    // 2) Hand the child to the agent-client-protocol crate to initialize the ACP client.
    //    Send an `initialize` request, then `session/new` with cwd=project_path.
    //    Cache the client handle in `Session`.
    //
    // 3) Spawn a tokio task that polls the agent for `session/update` notifications.
    //    For each chunk of role=assistant content, append to accumulator and
    //    emit `acp://chunk` to the frontend.
    //
    // The exact API calls depend on agent-client-protocol's surface; see its
    // crate docs. Implement straightforwardly.

    // Placeholder error so the function signature is correct; replace with real
    // implementation following the comments above.
    let _ = (state, session_id, project_path, SYSTEM_PROMPT);
    Err(anyhow!("start_session: implement using agent-client-protocol crate API"))
}

/// Forward a user prompt for the given session, awaiting the agent's full reply.
/// While the reply streams, emit `acp://chunk` events. When the turn ends:
///   - on parse success, emit `a2ui://graph` then `acp://turn-ended { success: true }`
///   - on parse failure, emit `acp://turn-ended { success: false, parse_error: ... }`
pub async fn send_prompt(app: AppHandle, session_id: String, text: String) -> Result<()> {
    let state = app.state::<AcpState>();
    let sess_arc = {
        let map = state.sessions.lock().await;
        map.get(&session_id)
            .cloned()
            .ok_or_else(|| anyhow!("unknown session {session_id}"))?
    };

    {
        let mut sess = sess_arc.lock().await;
        sess.accumulator.clear();
    }

    // 1) Send `session/prompt` over the ACP client. While it streams, the
    //    background pump (set up in start_session) will push chunks into the
    //    accumulator and emit `acp://chunk` events.
    //
    // 2) When the prompt response completes (stop reason received), take the
    //    accumulator and run parse_a2ui_block. Then emit the appropriate events.
    //
    // 3) Return Ok(()).

    let app_clone = app.clone();
    // Pseudocode body — replace with crate-specific API calls:
    //
    //   let response = sess.client.session_prompt(&session_id, &text).await?;
    //   // chunks were emitted via the pump
    //   let final_text = sess.accumulator.clone();
    //   match parse_a2ui_block(&final_text) {
    //       Ok(graph) => {
    //           app_clone.emit("a2ui://graph", GraphEvent { session_id, graph })?;
    //           app_clone.emit("acp://turn-ended", TurnEndedEvent { session_id, success: true, parse_error: None })?;
    //       }
    //       Err(e) => {
    //           app_clone.emit("acp://turn-ended", TurnEndedEvent { session_id, success: false, parse_error: Some(e.0) })?;
    //       }
    //   }

    let _ = (sess_arc, text, app_clone);
    Err(anyhow!("send_prompt: implement using agent-client-protocol crate API"))
}

/// Cancel an in-flight prompt, if the protocol supports it.
pub async fn cancel(app: AppHandle, session_id: String) -> Result<()> {
    let state = app.state::<AcpState>();
    let mut map = state.sessions.lock().await;
    if let Some(sess) = map.remove(&session_id) {
        // Drop sess: the underlying ACP client handle should close stdin / stdout,
        // causing the child process to exit. If your crate offers an explicit close,
        // call it here.
        drop(sess);
    }
    let _ = app;
    Ok(())
}
```

> **Implementer guidance:** The TODO regions in `start_session` and `send_prompt` are intentional — the exact API surface of `agent-client-protocol` is what dictates the calls. Read [the crate docs](https://docs.rs/agent-client-protocol/latest/agent_client_protocol/) and fill them in. Keep the function signatures, error types, and emitted event shapes exactly as defined above so Task 9 can wire them as Tauri commands without further changes.
>
> **Test path during implementation:** From the workspace root, run `cargo build -p app` after each change. Once compilation succeeds, do a smoke test by writing a tiny `main.rs` example or by exercising via the Tauri commands once Task 9 is complete.

- [ ] **Step 4: Verify it compiles**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace/app/src-tauri
cargo check 2>&1 | tail -10
```
Expected: Finished. (Warnings about unreachable `Err(anyhow!(...))` placeholders are expected if you ship the function bodies as written — replace with real calls before merging this task. The compiler should not error.)

- [ ] **Step 5: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock app/src-tauri/src/acp/client.rs
git commit -m "feat(acp): implement ACP session client (start, send_prompt, cancel)"
```

> If the implementer leaves the bodies as TODO sketches in this task, mark the commit message `wip(acp): scaffold ACP session client` and complete the bodies before Task 9's smoke test passes. The plan considers Task 8 complete only when a real `claude` invocation can be driven end-to-end (smoke-tested manually in Task 18).

---

## Task 9: Tauri commands + AcpState registration

**Files:**
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Read current lib.rs**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace/app/src-tauri
cat src/lib.rs
```
Note where `tauri::Builder::default()` lives.

- [ ] **Step 2: Add commands and state**

Edit `app/src-tauri/src/lib.rs` to look like (preserving any existing scaffold lines outside this block):
```rust
mod a2ui;
mod acp;

use crate::acp::client::{cancel as acp_cancel_inner, send_prompt as acp_send_prompt_inner,
    start_session as acp_start_session_inner, AcpState};
use tauri::{AppHandle, Manager};

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
            acp_start_session,
            acp_send_prompt,
            acp_cancel
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

If the existing `lib.rs` has additional commands or builder steps, preserve them — only add the `acp_*` commands, the `AcpState`, and the `mod` declarations.

- [ ] **Step 3: Verify compiles**

```
cargo check 2>&1 | tail -3
```
Expected: Finished, no errors.

- [ ] **Step 4: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src-tauri/src/lib.rs
git commit -m "feat(tauri): register acp_start_session/send_prompt/cancel commands"
```

---

## Task 10: Frontend ACP wrapper

**Files:**
- Create: `app/src/tauri/acp.ts`

- [ ] **Step 1: Implement**

Create `app/src/tauri/acp.ts`:
```ts
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { A2UIGraph } from '../a2ui/schema'

export async function startAcpSession(projectPath: string): Promise<string> {
  return invoke('acp_start_session', { projectPath })
}

export async function sendAcpPrompt(sessionId: string, text: string): Promise<void> {
  return invoke('acp_send_prompt', { sessionId, text })
}

export async function cancelAcpSession(sessionId: string): Promise<void> {
  return invoke('acp_cancel', { sessionId })
}

export interface ChunkEvent { session_id: string; delta: string }
export interface TurnEndedEvent { session_id: string; success: boolean; parse_error?: string }
export interface GraphEvent { session_id: string; graph: A2UIGraph }

export function onChunk(cb: (e: ChunkEvent) => void): Promise<UnlistenFn> {
  return listen<ChunkEvent>('acp://chunk', (e) => cb(e.payload))
}

export function onTurnEnded(cb: (e: TurnEndedEvent) => void): Promise<UnlistenFn> {
  return listen<TurnEndedEvent>('acp://turn-ended', (e) => cb(e.payload))
}

export function onGraph(cb: (e: GraphEvent) => void): Promise<UnlistenFn> {
  return listen<GraphEvent>('a2ui://graph', (e) => cb(e.payload))
}
```

- [ ] **Step 2: Type-check**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace/app
npx tsc --noEmit 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 3: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/tauri/acp.ts
git commit -m "feat(tauri): add frontend wrappers for ACP commands and events"
```

---

## Task 11: Extend fs.ts (list views, write graph)

**Files:**
- Modify: `app/src/tauri/fs.ts`

- [ ] **Step 1: Read current fs.ts**

```
cat app/src/tauri/fs.ts
```

- [ ] **Step 2: Replace contents**

Overwrite `app/src/tauri/fs.ts`:
```ts
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { basename, join } from '@tauri-apps/api/path'
import type { A2UIGraph } from '../a2ui/schema'

const VIEW_EXTENSIONS = ['.html', '.a2ui.json'] as const

/** Opens a folder picker. Returns absolute path or null if cancelled. */
export async function pickFolder(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false })
  if (typeof result === 'string') return result
  return null
}

/** Lists view files (.html and .a2ui.json) in `projectPath`, sorted ascending. */
export async function listProjectViews(projectPath: string): Promise<string[]> {
  const entries = await readDir(projectPath)
  const lower = (s: string) => s.toLowerCase()
  return entries
    .filter((e) => e.isFile && VIEW_EXTENSIONS.some((ext) => lower(e.name).endsWith(ext)))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))
}

/** Backwards-compatible alias for callers still expecting the .html-only filter. */
export const listHtmlFiles = listProjectViews

/** Reads a view file's text contents. */
export async function readViewFile(projectPath: string, filename: string): Promise<string> {
  const full = await join(projectPath, filename)
  return readTextFile(full)
}

/** Writes an A2UI graph to `<projectPath>/<filename>` as pretty JSON. */
export async function writeViewGraph(projectPath: string, filename: string, graph: A2UIGraph): Promise<void> {
  const full = await join(projectPath, filename)
  await writeTextFile(full, JSON.stringify(graph, null, 2))
}

/** Returns the basename of a path (last segment). */
export async function pathBasename(path: string): Promise<string> {
  return basename(path)
}
```

The new `listProjectViews` returns the union of `.html` and `.a2ui.json`. The exported `listHtmlFiles` alias means `App.tsx` from MVP1 keeps working without immediate change (it'll just see more entries — which is exactly what we want).

- [ ] **Step 3: Type-check**

```
npx tsc --noEmit 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 4: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/tauri/fs.ts
git commit -m "feat(tauri): listProjectViews returns .html ∪ .a2ui.json; add writeViewGraph"
```

---

## Task 12: StepNode component

**Files:**
- Create: `app/src/components/StepNode.tsx`

- [ ] **Step 1: Implement**

Create `app/src/components/StepNode.tsx`:
```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { StepNodeData } from '../canvas/layout'

export function StepNode({ data, selected }: NodeProps & { data: StepNodeData }) {
  return (
    <div className={`step-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="step-label">{data.label}</div>
      {data.explanation && <div className="step-expl">{data.explanation}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/components/StepNode.tsx
git commit -m "feat(ui): add StepNode component for React Flow"
```

---

## Task 13: CanvasViewer component

**Files:**
- Create: `app/src/components/CanvasViewer.tsx`

- [ ] **Step 1: Implement**

Create `app/src/components/CanvasViewer.tsx`:
```tsx
import { useMemo } from 'react'
import { ReactFlow, Background, Controls, MiniMap, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { A2UIGraph } from '../a2ui/schema'
import { layoutGraph } from '../canvas/layout'
import { StepNode } from './StepNode'

const nodeTypes: NodeTypes = { step: StepNode as unknown as NodeTypes[string] }

interface Props {
  graph: A2UIGraph | null
  parseError?: string | null
}

export function CanvasViewer({ graph, parseError }: Props) {
  const { nodes, edges } = useMemo(
    () => (graph ? layoutGraph(graph) : { nodes: [], edges: [] }),
    [graph],
  )

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="canvas-empty">
        <p>{parseError ?? 'Type a prompt below to analyze a workflow.'}</p>
      </div>
    )
  }

  return (
    <div className="canvas-host">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        fitView
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace/app
npx tsc --noEmit 2>&1 | tail -3
```
Expected: clean. (If `nodeTypes` typing complains, simplify the cast — the React Flow types for custom node components vary slightly between versions.)

- [ ] **Step 3: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/components/CanvasViewer.tsx
git commit -m "feat(ui): add CanvasViewer (React Flow + dagre rendering)"
```

---

## Task 14: ChatPanel component

**Files:**
- Create: `app/src/components/ChatPanel.tsx`

- [ ] **Step 1: Implement**

Create `app/src/components/ChatPanel.tsx`:
```tsx
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ChatMessage } from '../store/chatStore'

interface Props {
  messages: ChatMessage[]
  isStreaming: boolean
  parseError: string | null
  onSend: (text: string) => void
  disabledReason?: string | null
}

export function ChatPanel({ messages, isStreaming, parseError, onSend, disabledReason }: Props) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, isStreaming])

  function submit() {
    const text = draft.trim()
    if (!text || isStreaming || disabledReason) return
    setDraft('')
    onSend(text)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && !parseError && (
          <div className="chat-hint">Type something like "分析 src/auth/login.ts" and press Enter.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg-${m.role}`}>
            <div className="chat-role">{m.role}</div>
            <div className="chat-text">{m.text}</div>
          </div>
        ))}
        {isStreaming && <div className="chat-streaming">…</div>}
        {parseError && <div className="chat-error">{parseError}</div>}
      </div>
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={disabledReason ?? 'Describe the workflow to analyze…'}
          disabled={Boolean(disabledReason)}
          rows={2}
        />
        <button onClick={submit} disabled={isStreaming || Boolean(disabledReason) || !draft.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/components/ChatPanel.tsx
git commit -m "feat(ui): add ChatPanel component"
```

---

## Task 15: Sidebar update — extension filter + New Canvas button

**Files:**
- Modify: `app/src/components/Sidebar.tsx`

- [ ] **Step 1: Read current Sidebar**

```
cat app/src/components/Sidebar.tsx
```

- [ ] **Step 2: Replace**

Overwrite `app/src/components/Sidebar.tsx`:
```tsx
interface Props {
  views: string[]
  activeView: string | null
  onSelect: (filename: string) => void
  onRefresh: () => void
  onNewCanvas: () => void
}

function displayName(filename: string): string {
  return filename.replace(/\.a2ui\.json$/i, '').replace(/\.html$/i, '')
}

function kindBadge(filename: string): string {
  if (filename.toLowerCase().endsWith('.a2ui.json')) return 'canvas'
  if (filename.toLowerCase().endsWith('.html')) return 'html'
  return ''
}

export function Sidebar({ views, activeView, onSelect, onRefresh, onNewCanvas }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>Views</span>
        <div className="sidebar-actions">
          <button onClick={onNewCanvas} title="Create a new A2UI canvas">+ Canvas</button>
          <button onClick={onRefresh} title="Re-scan project folder">Refresh</button>
        </div>
      </div>
      <ul className="view-list">
        {views.length === 0 && <li className="empty-hint">No views found.</li>}
        {views.map((name) => (
          <li
            key={name}
            className={name === activeView ? 'active' : ''}
            onClick={() => onSelect(name)}
          >
            <span className="view-name">{displayName(name)}</span>
            <span className={`view-kind kind-${kindBadge(name)}`}>{kindBadge(name)}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
```

- [ ] **Step 3: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/components/Sidebar.tsx
git commit -m "feat(ui): Sidebar shows view kinds + New Canvas button"
```

---

## Task 16: ViewerPane dispatch by extension

**Files:**
- Modify: `app/src/components/ViewerPane.tsx`

- [ ] **Step 1: Read current**

```
cat app/src/components/ViewerPane.tsx
```

- [ ] **Step 2: Replace**

Overwrite `app/src/components/ViewerPane.tsx`:
```tsx
import type { A2UIGraph } from '../a2ui/schema'
import { CanvasViewer } from './CanvasViewer'

interface Props {
  /** Active filename (drives extension dispatch). null when no tab is active. */
  filename: string | null
  /** Raw HTML content for an .html view, null otherwise. */
  html: string | null
  /** A2UI graph for an .a2ui.json view, null otherwise. */
  graph: A2UIGraph | null
  /** Parse error, if any (canvas only). */
  parseError?: string | null
}

export function ViewerPane({ filename, html, graph, parseError }: Props) {
  if (!filename) {
    return (
      <div className="viewer-empty">
        <p>No view open. Pick one from the sidebar.</p>
      </div>
    )
  }

  if (filename.toLowerCase().endsWith('.a2ui.json')) {
    return <CanvasViewer graph={graph} parseError={parseError} />
  }

  if (filename.toLowerCase().endsWith('.html')) {
    if (html === null) {
      return <div className="viewer-empty"><p>Loading…</p></div>
    }
    return (
      <iframe
        key={filename}
        className="viewer-iframe"
        sandbox=""
        srcDoc={html}
        title={filename}
      />
    )
  }

  return (
    <div className="viewer-empty">
      <p>Unsupported view type: {filename}</p>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/components/ViewerPane.tsx
git commit -m "feat(ui): ViewerPane dispatches by extension (.html → iframe, .a2ui.json → canvas)"
```

---

## Task 17: App composition — wire chat, canvas, ACP, persistence

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/src/styles.css`

- [ ] **Step 1: Replace `App.tsx`**

Overwrite `app/src/App.tsx`:
```tsx
import { useEffect, useState, useRef } from 'react'
import { useProjectStore } from './store/projectStore'
import { useChatStore } from './store/chatStore'
import { useCanvasStore } from './store/canvasStore'
import {
  pickFolder,
  listProjectViews,
  readViewFile,
  pathBasename,
  writeViewGraph,
} from './tauri/fs'
import { loadLastProject, saveLastProject } from './tauri/persistence'
import { seedSampleProjectIfMissing } from './seed/seedSampleProject'
import {
  startAcpSession,
  sendAcpPrompt,
  cancelAcpSession,
  onChunk,
  onTurnEnded,
  onGraph,
} from './tauri/acp'
import { emptyGraph, isValidA2UIGraph, type A2UIGraph } from './a2ui/schema'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { TabStrip } from './components/TabStrip'
import { ViewerPane } from './components/ViewerPane'
import { ChatPanel } from './components/ChatPanel'
import { EmptyState } from './components/EmptyState'

const DEFAULT_CANVAS_NAME = 'Untitled.a2ui.json'

export default function App() {
  const {
    currentProject,
    viewList,
    openTabs,
    activeTab,
    openProject,
    openView,
    closeTab,
    refreshViewList,
  } = useProjectStore()

  const chat = useChatStore()
  const canvas = useCanvasStore()

  const [projectName, setProjectName] = useState<string | null>(null)
  const [activeHtml, setActiveHtml] = useState<string | null>(null)
  const sessionMap = useRef<Record<string, string>>({}) // filename → session_id

  // Restore last project (with stale-clear, same as MVP1).
  useEffect(() => {
    ;(async () => {
      const last = await loadLastProject()
      if (!last) return
      const ok = await tryOpenProjectAt(last)
      if (!ok) await saveLastProject(null)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    ;(async () => {
      setProjectName(currentProject ? await pathBasename(currentProject) : null)
    })()
  }, [currentProject])

  // Load active view content. .html → setActiveHtml, .a2ui.json → parse + canvasStore.
  useEffect(() => {
    ;(async () => {
      setActiveHtml(null)
      if (!currentProject || !activeTab) return
      try {
        const text = await readViewFile(currentProject, activeTab)
        if (activeTab.toLowerCase().endsWith('.html')) {
          setActiveHtml(text)
        } else if (activeTab.toLowerCase().endsWith('.a2ui.json')) {
          // Empty file = treat as empty graph
          if (text.trim().length === 0) {
            canvas.setGraph(activeTab, emptyGraph())
            return
          }
          const parsed = JSON.parse(text)
          const v = isValidA2UIGraph(parsed)
          if (v.ok) canvas.setGraph(activeTab, parsed as A2UIGraph)
          else canvas.setGraph(activeTab, emptyGraph())
        }
      } catch (err) {
        console.error('readViewFile failed:', err)
        if (activeTab.toLowerCase().endsWith('.html')) {
          setActiveHtml(`<p style="font-family:sans-serif;padding:24px;color:#a00">Failed to read ${activeTab}: ${String(err)}</p>`)
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, activeTab])

  // Subscribe to ACP events (mounted once).
  useEffect(() => {
    let unsub1: (() => void) | null = null
    let unsub2: (() => void) | null = null
    let unsub3: (() => void) | null = null
    ;(async () => {
      unsub1 = await onChunk(({ session_id, delta }) => {
        const filename = filenameForSession(session_id)
        if (filename) chat.appendAssistantChunk(filename, delta)
      })
      unsub2 = await onTurnEnded(({ session_id, success, parse_error }) => {
        const filename = filenameForSession(session_id)
        if (!filename) return
        chat.endTurn(filename, { success, parseError: parse_error })
      })
      unsub3 = await onGraph(({ session_id, graph }) => {
        const filename = filenameForSession(session_id)
        if (!filename || !currentProject) return
        canvas.setGraph(filename, graph)
        // Persist to disk (overwrite the active .a2ui.json view).
        writeViewGraph(currentProject, filename, graph).catch((err) =>
          console.error('writeViewGraph failed:', err),
        )
      })
    })()
    return () => {
      unsub1?.()
      unsub2?.()
      unsub3?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject])

  function filenameForSession(sessionId: string): string | null {
    for (const [filename, sid] of Object.entries(sessionMap.current)) {
      if (sid === sessionId) return filename
    }
    return null
  }

  async function ensureSession(filename: string): Promise<string | null> {
    if (!currentProject) return null
    const existing = sessionMap.current[filename]
    if (existing) return existing
    try {
      const sid = await startAcpSession(currentProject)
      sessionMap.current[filename] = sid
      return sid
    } catch (err) {
      console.error('startAcpSession failed:', err)
      chat.endTurn(filename, { success: false, parseError: `failed to start agent: ${String(err)}` })
      return null
    }
  }

  async function tryOpenProjectAt(path: string): Promise<boolean> {
    try {
      const files = await listProjectViews(path)
      openProject(path, files)
      await saveLastProject(path)
      return true
    } catch (err) {
      console.error('Failed to open project:', err)
      return false
    }
  }

  async function handleOpenProject() {
    const path = await pickFolder()
    if (path) await tryOpenProjectAt(path)
  }

  async function handleOpenSample() {
    const samplePath = await seedSampleProjectIfMissing()
    if (samplePath) await tryOpenProjectAt(samplePath)
  }

  async function handleRefresh() {
    if (!currentProject) return
    try {
      const files = await listProjectViews(currentProject)
      refreshViewList(files)
    } catch (err) {
      console.error('refresh failed:', err)
    }
  }

  async function handleNewCanvas() {
    if (!currentProject) return
    // Pick a name that doesn't collide.
    let name = DEFAULT_CANVAS_NAME
    let i = 1
    while (viewList.includes(name)) {
      name = `Untitled-${i}.a2ui.json`
      i += 1
    }
    try {
      await writeViewGraph(currentProject, name, emptyGraph())
      const files = await listProjectViews(currentProject)
      refreshViewList(files)
      openView(name)
    } catch (err) {
      console.error('handleNewCanvas failed:', err)
    }
  }

  async function handleSendChat(text: string) {
    if (!activeTab || !activeTab.toLowerCase().endsWith('.a2ui.json')) return
    chat.appendUserMessage(activeTab, text)
    const sid = await ensureSession(activeTab)
    if (!sid) return
    try {
      await sendAcpPrompt(sid, text)
    } catch (err) {
      console.error('sendAcpPrompt failed:', err)
      chat.endTurn(activeTab, { success: false, parseError: String(err) })
    }
  }

  async function handleCloseTab(filename: string) {
    closeTab(filename)
    const sid = sessionMap.current[filename]
    if (sid) {
      cancelAcpSession(sid).catch((err) => console.error('cancelAcpSession:', err))
      delete sessionMap.current[filename]
      chat.discardSession(filename)
      canvas.discard(filename)
    }
  }

  if (!currentProject) {
    return (
      <EmptyState onOpenProject={handleOpenProject} onOpenSample={handleOpenSample} />
    )
  }

  const isCanvas = activeTab?.toLowerCase().endsWith('.a2ui.json') ?? false
  const session = activeTab ? chat.sessions[activeTab] : undefined

  return (
    <div className="app">
      <TopBar projectName={projectName} onOpenProject={handleOpenProject} />
      <div className="app-body">
        <Sidebar
          views={viewList}
          activeView={activeTab}
          onSelect={openView}
          onRefresh={handleRefresh}
          onNewCanvas={handleNewCanvas}
        />
        <main className="viewer">
          <TabStrip
            tabs={openTabs}
            activeTab={activeTab}
            onActivate={openView}
            onClose={handleCloseTab}
          />
          <div className="viewer-body">
            <ViewerPane
              filename={activeTab}
              html={activeHtml}
              graph={activeTab ? canvas.getGraph(activeTab) : null}
              parseError={session?.parseError}
            />
            {isCanvas && activeTab && (
              <ChatPanel
                messages={session?.messages ?? []}
                isStreaming={session?.isStreaming ?? false}
                parseError={session?.parseError ?? null}
                onSend={handleSendChat}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Append styles**

Open `app/src/styles.css` and append:
```css
.viewer-body { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.viewer-body > .canvas-host,
.viewer-body > .viewer-iframe,
.viewer-body > .viewer-empty { flex: 1; min-height: 0; }

.canvas-host { background: #fff; height: 100%; }
.canvas-empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: #888; padding: 24px; text-align: center;
}

.step-node {
  background: #fff; border: 1.5px solid #444; border-radius: 8px;
  padding: 8px 14px; min-width: 140px; max-width: 220px;
  font-size: 13px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.step-node.selected { border-color: #1c4ad6; box-shadow: 0 0 0 2px #d8e4ff; }
.step-label { font-weight: 600; color: #1e1e1e; }
.step-expl { color: #666; font-size: 11px; margin-top: 4px; line-height: 1.3; }

.chat-panel {
  border-top: 1px solid #ddd; background: #fafafa;
  display: flex; flex-direction: column; max-height: 280px; min-height: 180px;
}
.chat-messages {
  flex: 1; overflow-y: auto; padding: 10px 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.chat-hint { color: #888; font-style: italic; }
.chat-msg { display: flex; flex-direction: column; gap: 2px; }
.chat-msg-user .chat-text { background: #d8e4ff; }
.chat-msg-assistant .chat-text { background: #fff; border: 1px solid #e3e3e3; }
.chat-role { font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.04em; }
.chat-text { padding: 6px 10px; border-radius: 6px; white-space: pre-wrap; font-size: 13px; line-height: 1.4; }
.chat-streaming { color: #888; padding: 4px 10px; }
.chat-error { color: #c00; padding: 6px 10px; background: #fee; border-radius: 6px; font-size: 12px; }

.chat-input-row { display: flex; gap: 8px; padding: 8px 12px; border-top: 1px solid #e3e3e3; background: #fff; }
.chat-input {
  flex: 1; border: 1px solid #bbb; border-radius: 4px; padding: 6px 8px;
  font: inherit; font-size: 13px; resize: vertical;
}
.chat-input:disabled { background: #f0f0f0; color: #888; }

.sidebar-actions { display: flex; gap: 4px; }
.view-list li { display: flex; justify-content: space-between; align-items: center; }
.view-kind {
  font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em;
  color: #888; border: 1px solid #ddd; border-radius: 3px; padding: 1px 5px;
}
.view-kind.kind-canvas { color: #1c4ad6; border-color: #b8c8f0; }
```

- [ ] **Step 3: Verify build**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace/app
npx tsc --noEmit 2>&1 | tail -3
npm test 2>&1 | tail -5
npm run build 2>&1 | tail -3
```
Expected: tsc clean, all tests pass (12 from MVP1 + ~22 new = ~34 total), `npm run build` succeeds.

- [ ] **Step 4: Commit**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/App.tsx app/src/styles.css
git commit -m "feat: wire chat panel + canvas viewer + ACP session lifecycle"
```

---

## Task 18: Manual acceptance — analyze the Curation project

This task drives the spec's success scenario. It cannot be automated because it requires the GUI and an installed `claude` CLI.

- [ ] **Step 1: Pre-flight**

Confirm:
```
claude --version          # any version output
which claude              # in $PATH
npx -y @zed-industries/claude-code-acp@0.16 --version 2>&1 | head -3
```

If `claude` is missing, install Claude Code and ensure the user is authenticated. The npx invocation should print or at least not error — first run downloads the adapter (~10-30s).

- [ ] **Step 2: Launch the app**

```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace/app
npm run tauri dev
```

Wait for the window. The first compile may take minutes.

- [ ] **Step 3: Open the Curation project**

Click "Open Project…", navigate to `~/Projects/Efficiency/Curation` (or another `Curation*` variant if that one is empty).

Expected: top bar shows `Curation`. Sidebar lists `.html` and `.a2ui.json` files (likely none of either initially).

- [ ] **Step 4: Create a new canvas**

In the sidebar, click "+ Canvas". Expected:
- A new tab opens for `Untitled.a2ui.json`.
- The canvas area shows "Type a prompt below to analyze a workflow."
- The chat panel is visible at the bottom of the viewer.

- [ ] **Step 5: Send the analysis prompt**

In the chat input, type: `分析用户点击订阅公众号会发生什么` and press Enter.

Expected:
- Your message appears as a `user` bubble.
- After a brief delay, an `assistant` bubble appears and accumulates streaming text as Claude Code investigates the codebase.
- During streaming, the canvas remains in its empty placeholder state.

- [ ] **Step 6: See the canvas render**

When the agent finishes, expected:
- The canvas updates to show a flow chart with multiple step nodes (e.g., a UI click handler, an event dispatch, an API call, a server-side hook, etc.) connected with directed edges.
- Layout is top-to-bottom (dagre).
- Pan/zoom and minimap are functional.
- The sidebar still shows `Untitled.a2ui.json`. The `.a2ui.json` file in the Curation folder now contains the graph JSON (verify with: open the file in any text editor).

- [ ] **Step 7: Reload check**

Close the tab, then click `Untitled.a2ui.json` in the sidebar to reopen it. Expected:
- Canvas re-renders the same graph from disk.
- Chat panel is empty (chat history is in-memory only — confirm this matches spec).

- [ ] **Step 8: Persistence across restarts**

Quit the app (close window), restart with `npm run tauri dev`. Expected:
- App opens directly to the Curation project (last-project persistence).
- Sidebar still shows `Untitled.a2ui.json`.
- Click it to confirm graph re-renders.

- [ ] **Step 9: Failure-mode check**

Click "+ Canvas" again to create a second canvas. Type a prompt that the agent likely cannot map to a workflow (e.g., `tell me a poem`). When the agent finishes without emitting an A2UI block, expected:
- Chat shows an error: "Agent did not produce a valid A2UI graph. (no a2ui block found …)"
- Canvas stays in placeholder state.
- App remains responsive; you can send another prompt.

- [ ] **Step 10: Tag the milestone**

If all checks above pass:
```
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git tag mvp-a2ui-reactflow -m "A2UI + React Flow MVP acceptance passed"
```

If any step fails, do **not** tag. Fix the underlying bug (likely in Task 8 or Task 17) and recommit.

---

## Out of Scope (per spec — do not let them creep in)

- Multi-turn graph refinement (next spec)
- Click-node-to-jump-to-source-code (codeRef captured but not navigable)
- MCP-driven streaming graph deltas
- Gemini CLI support
- Embedded terminal panel
- Physics-simulation layout (dagre static only)
- Multi-agent / branch / compare views
- Graph editing inside Delineation (external editor only)
- Chat history persistence (in-memory only)
