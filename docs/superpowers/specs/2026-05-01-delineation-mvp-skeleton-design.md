# Delineation MVP Skeleton — Design

**Date:** 2026-05-01
**Status:** Approved for planning

## Goal

Build the most basic shell of Delineation: a Tauri desktop app where the user opens a **Project** (a folder on disk) and browses **Views** (`.html` files inside it) through an Obsidian-like layout — left sidebar list, right tabbed viewer.

This MVP locks in the two core concepts (Project and View) and a working render path. A2UI runtime, editing, Agents, and plugins are explicitly deferred.

## Non-Goals

- A2UI runtime / interactive action callbacks (views render as static HTML for now; A2UI attributes are allowed in markup but not parsed)
- Any in-app view editor (users edit `.html` files externally)
- File watcher / auto-refresh
- Subfolders, search, view-to-view links, tags
- Multiple Projects open simultaneously
- Composition vs Orientation mode distinction
- Plugin system
- Remote Agents / server connection

## Tech Stack

- **Tauri 2** — desktop shell, filesystem and dialog access
- **Vite + React + TypeScript** — frontend
- **Zustand** — state management (lightweight, matches README's stated direction)
- **Vitest** — unit tests for store logic

## Core Concepts

| Concept     | Definition                                                                 |
| ----------- | -------------------------------------------------------------------------- |
| **Project** | A folder on disk. No metadata required — any folder can be opened as one.  |
| **View**    | An `.html` file in the Project root. Filename (without `.html`) = display name. |

In the future, a View will be an A2UI page driven by an Agent. In the MVP, it's a hand-authored static HTML file we render in an isolated iframe.

## Data Model

### On disk
```
<project-folder>/
  overview.html
  data-flow.html
  notes.html
  ...
```
Flat layout only. Subfolders are ignored in MVP.

### App state (Zustand store)
- `currentProject: string | null` — absolute path of the open Project
- `viewList: string[]` — filenames of `.html` files in Project root (refreshed on open / manual refresh)
- `openTabs: string[]` — view filenames currently open as tabs (in tab order)
- `activeTab: string | null` — filename of the active tab

### Persistence
- **Persisted across sessions:** last opened Project path only (Tauri app data dir, single JSON file)
- **Not persisted:** open tabs, active tab, view content cache

## UI Layout

```
┌─────────────────────────────────────────────────────────┐
│ Top bar: <project-name>            [Open Project…]      │
├──────────────┬──────────────────────────────────────────┤
│ Sidebar      │ Tabs: [overview×] [data-flow×]           │
│              ├──────────────────────────────────────────┤
│ • overview   │                                          │
│ • data-flow  │   <iframe srcdoc="..." sandbox>          │
│ • notes      │       (renders the active view)          │
│              │                                          │
│ [Refresh]    │                                          │
└──────────────┴──────────────────────────────────────────┘
```

- **Top bar:** shows current Project name (folder basename) and an "Open Project…" button that triggers a Tauri folder-picker dialog.
- **Sidebar (left):** list of `.html` files, alphabetical by filename. Click → open as new tab or activate existing tab. "Refresh" button re-scans the Project folder.
- **Viewer (right):** tab strip + iframe content area. Tabs are closeable. The iframe uses `sandbox=""` (most restrictive: no scripts, no same-origin — safe static render) and `srcdoc` is the file contents. When A2UI runtime is added later, the sandbox attributes will be revisited in that spec.

## Key Flows

### First launch (no last project)
Show empty state: large "Open Project" button + secondary "Open Sample Project" button.

### Open Project
1. Show folder picker (Tauri dialog).
2. Read directory entries; filter to `*.html` at top level only.
3. Set `currentProject`, populate `viewList`, clear `openTabs`/`activeTab`.
4. Persist path to app data dir.

### Open View
1. User clicks a sidebar item.
2. If filename already in `openTabs` → set `activeTab`.
3. Otherwise → read file contents, append filename to `openTabs`, set as `activeTab`. (File contents are read on demand each time a tab activates; no cache in MVP.)

### Close tab
Remove from `openTabs`; if it was active, activate the next tab to its right (or left if it was last); if no tabs remain, `activeTab = null` and show empty viewer state.

### Refresh sidebar
Re-scan Project folder. Tabs whose underlying file no longer exists stay open (showing last-loaded content) — closing the tab is the user's call. (Simple, avoids surprise.)

## Seed Data

On first app launch (no `currentProject` persisted), copy a bundled `Sample Project/` into the user's app data dir, containing three example views:
- `overview.html` — an architectural overview with inline SVG node-and-edge diagram + paragraph text
- `data-flow.html` — a data-flow diagram with annotations
- `notes.html` — plain prose notes about a system

These ship inside the app bundle and are written out only if the target folder doesn't already exist. The empty state's "Open Sample Project" button opens this folder directly.

## Testing

- **Vitest unit tests** on the Zustand store: opening / closing / activating tabs, dedup on re-open, active-tab fallback when closing the active tab, viewList population.
- **Manual acceptance** for the Tauri integration (file dialog, iframe rendering, persistence) — no automated end-to-end in MVP.

## File / Module Structure (proposed)

```
src/
  main.tsx
  App.tsx
  components/
    TopBar.tsx
    Sidebar.tsx
    TabStrip.tsx
    ViewerPane.tsx
    EmptyState.tsx
  store/
    projectStore.ts          # Zustand store
    projectStore.test.ts
  tauri/
    fs.ts                    # thin wrappers around Tauri fs/dialog APIs
    persistence.ts           # last-project read/write
  seed/
    sampleProject/           # bundled into app resources
      overview.html
      data-flow.html
      notes.html
src-tauri/                   # Tauri Rust side (default scaffold + fs/dialog allowlist)
```

## Open Questions (resolved during brainstorm)

- Storage format → `.html` files, flat in Project root.
- Tab persistence → no, MVP only persists last Project path.
- File watcher → no, manual refresh button.
- A2UI parsing → no, static render only.
- Edit in app → no, external editor.

## What This Unlocks

Once this skeleton ships, the natural next increments are:
- A2UI runtime inside the iframe (interactive views, action callbacks) — separate spec
- Agent integration that produces / updates views — separate spec
- Composition vs Orientation mode split — separate spec
- Plugin system — separate spec

Each of these gets its own brainstorm → spec → plan cycle.
