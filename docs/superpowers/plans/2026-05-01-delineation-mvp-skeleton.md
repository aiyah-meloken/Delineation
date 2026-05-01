# Delineation MVP Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the most basic shell of Delineation — a Tauri 2 desktop app that opens a Project (folder) and displays its `.html` Views in an Obsidian-like sidebar + tabbed viewer.

**Architecture:** Tauri 2 (Rust shell) + Vite + React + TypeScript on the frontend, Zustand for app state, Vitest for store unit tests. Views render as static HTML inside a sandboxed iframe (no script execution). Last-opened-Project path is persisted in Tauri app data dir; tab state is in-memory only.

**Tech Stack:** Tauri 2 · Vite · React 18 · TypeScript · Zustand · Vitest · `@tauri-apps/plugin-fs` · `@tauri-apps/plugin-dialog`

**Repo layout decision:** The Tauri app lives in a subdirectory `app/` (the workspace root already contains `docs/` and the brainstorm artifacts, so we cannot scaffold into root). All source paths in this plan are relative to `app/` unless explicitly prefixed with `app/`.

---

## File Structure

```
Delineation-Workspace/
├── docs/                                        (unchanged)
├── app/                                         <- Tauri app root
│   ├── package.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx                             # React entry
│   │   ├── App.tsx                              # Top-level layout
│   │   ├── components/
│   │   │   ├── TopBar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TabStrip.tsx
│   │   │   ├── ViewerPane.tsx
│   │   │   └── EmptyState.tsx
│   │   ├── store/
│   │   │   ├── projectStore.ts                  # Zustand store (pure logic)
│   │   │   └── projectStore.test.ts             # Vitest unit tests
│   │   ├── tauri/
│   │   │   ├── fs.ts                            # selectFolder / listHtml / readView
│   │   │   └── persistence.ts                   # last-project path read/write
│   │   ├── seed/
│   │   │   └── seedSampleProject.ts             # first-run copy logic
│   │   └── styles.css
│   └── src-tauri/
│       ├── Cargo.toml
│       ├── tauri.conf.json
│       ├── capabilities/
│       │   └── default.json                     # fs + dialog permissions
│       ├── resources/
│       │   └── sample-project/
│       │       ├── overview.html
│       │       ├── data-flow.html
│       │       └── notes.html
│       └── src/
│           ├── main.rs
│           └── lib.rs
```

---

## Task 1: Scaffold the Tauri app

**Files:**
- Create: `app/` (whole directory tree from `create-tauri-app`)

- [ ] **Step 1: Verify prerequisites**

Run: `node --version && npm --version && rustc --version && cargo --version`
Expected: Node ≥ 18, npm ≥ 9, Rust ≥ 1.77, cargo present. If Rust missing, install via `https://rustup.rs` and rerun.

- [ ] **Step 2: Scaffold the Tauri 2 app into `app/`**

Run from workspace root:
```bash
npm create tauri-app@latest -- \
  --yes \
  --identifier com.delineation.app \
  --manager npm \
  --template react-ts \
  app
```

Expected: A new directory `app/` is created with `package.json`, `index.html`, `src/`, `src-tauri/`, etc. The `--yes` flag skips prompts.

If your installed `create-tauri-app` rejects `--yes`, run interactively and answer: name `app`, identifier `com.delineation.app`, manager `npm`, template `React`, language `TypeScript`.

- [ ] **Step 3: Install npm dependencies**

```bash
cd app
npm install
```

Expected: `node_modules/` populated, no errors.

- [ ] **Step 4: Smoke test the dev server (frontend only)**

```bash
cd app
npm run dev
```

Expected: Vite prints `Local: http://localhost:1420` (or similar). Open it in a browser — you should see the default Tauri scaffold page. Stop with Ctrl-C.

- [ ] **Step 5: Smoke test `tauri dev`**

```bash
cd app
npm run tauri dev
```

Expected: A native window opens showing the Tauri scaffold. Close the window to stop.
(First run compiles Rust dependencies — may take several minutes.)

- [ ] **Step 6: Commit**

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/.gitignore app/package.json app/package-lock.json app/index.html app/vite.config.ts app/tsconfig.json app/tsconfig.node.json app/src app/src-tauri app/public 2>/dev/null
# Some scaffold files may not exist; the * patterns above tolerate that.
git add app/
git status
git commit -m "feat: scaffold Tauri 2 + React + TS app in app/"
```

Expected: `git status` shows the new app/ tree. Commit succeeds.

---

## Task 2: Add Zustand, Vitest, and project dependencies

**Files:**
- Modify: `app/package.json`
- Create: `app/vitest.config.ts`

- [ ] **Step 1: Install runtime + test dependencies**

```bash
cd app
npm install zustand
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
npm install @tauri-apps/plugin-fs @tauri-apps/plugin-dialog
```

Expected: Each install succeeds. `package.json` `dependencies` now includes `zustand`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`; `devDependencies` includes `vitest`, `jsdom`, etc.

- [ ] **Step 2: Add the Rust plugin crates**

```bash
cd app/src-tauri
cargo add tauri-plugin-fs tauri-plugin-dialog
```

Expected: `Cargo.toml` gains `tauri-plugin-fs` and `tauri-plugin-dialog` under `[dependencies]`.

- [ ] **Step 3: Create the Vitest config**

Create `app/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
```

- [ ] **Step 4: Add the `test` script to `package.json`**

In `app/package.json`, under `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

(Keep all existing scripts.)

- [ ] **Step 5: Verify `npm test` runs (with no tests yet)**

```bash
cd app
npm test
```

Expected: Vitest reports `No test files found` and exits 0 (or exits with code 1 saying "no tests" — in that case append `--passWithNoTests` to the script). Adjust the script to:
```json
"test": "vitest run --passWithNoTests"
```
and rerun. Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/package.json app/package-lock.json app/vitest.config.ts app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock
git commit -m "chore: add zustand, vitest, tauri fs/dialog plugins"
```

---

## Task 3: Define the ProjectStore — types and skeleton

**Files:**
- Create: `app/src/store/projectStore.ts`
- Create: `app/src/store/projectStore.test.ts`

- [ ] **Step 1: Write the failing test for the initial store state**

Create `app/src/store/projectStore.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from './projectStore'

describe('projectStore', () => {
  beforeEach(() => {
    useProjectStore.getState().reset()
  })

  it('starts with no project, empty view list, no tabs', () => {
    const state = useProjectStore.getState()
    expect(state.currentProject).toBeNull()
    expect(state.viewList).toEqual([])
    expect(state.openTabs).toEqual([])
    expect(state.activeTab).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test — verify it fails**

```bash
cd app
npm test -- store/projectStore.test
```

Expected: FAIL — `Cannot find module './projectStore'`.

- [ ] **Step 3: Implement the minimal store**

Create `app/src/store/projectStore.ts`:
```ts
import { create } from 'zustand'

export interface ProjectState {
  currentProject: string | null   // absolute path
  viewList: string[]              // .html filenames in project root, sorted
  openTabs: string[]              // filenames currently open as tabs
  activeTab: string | null        // currently focused tab filename
  reset: () => void
}

const initialState = {
  currentProject: null,
  viewList: [],
  openTabs: [],
  activeTab: null,
} satisfies Omit<ProjectState, 'reset'>

export const useProjectStore = create<ProjectState>((set) => ({
  ...initialState,
  reset: () => set(initialState),
}))
```

- [ ] **Step 4: Run the test — verify it passes**

```bash
cd app
npm test -- store/projectStore.test
```

Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/store/projectStore.ts app/src/store/projectStore.test.ts
git commit -m "feat(store): add ProjectStore skeleton with initial state"
```

---

## Task 4: ProjectStore — openProject action

**Files:**
- Modify: `app/src/store/projectStore.ts`
- Modify: `app/src/store/projectStore.test.ts`

- [ ] **Step 1: Write the failing tests for `openProject`**

Append to `app/src/store/projectStore.test.ts`:
```ts
describe('openProject', () => {
  beforeEach(() => {
    useProjectStore.getState().reset()
  })

  it('sets currentProject and viewList (sorted)', () => {
    useProjectStore.getState().openProject('/path/to/proj', ['z.html', 'a.html', 'm.html'])
    const s = useProjectStore.getState()
    expect(s.currentProject).toBe('/path/to/proj')
    expect(s.viewList).toEqual(['a.html', 'm.html', 'z.html'])
  })

  it('clears tabs from a previous project', () => {
    useProjectStore.setState({
      currentProject: '/old',
      viewList: ['old.html'],
      openTabs: ['old.html'],
      activeTab: 'old.html',
    })
    useProjectStore.getState().openProject('/new', ['new.html'])
    const s = useProjectStore.getState()
    expect(s.openTabs).toEqual([])
    expect(s.activeTab).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd app
npm test -- store/projectStore.test
```

Expected: FAIL — `openProject is not a function`.

- [ ] **Step 3: Implement `openProject`**

In `app/src/store/projectStore.ts`, extend the interface and store:
```ts
export interface ProjectState {
  currentProject: string | null
  viewList: string[]
  openTabs: string[]
  activeTab: string | null
  reset: () => void
  openProject: (path: string, htmlFiles: string[]) => void
}
```

In the `create` body, add:
```ts
openProject: (path, htmlFiles) =>
  set({
    currentProject: path,
    viewList: [...htmlFiles].sort((a, b) => a.localeCompare(b)),
    openTabs: [],
    activeTab: null,
  }),
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd app
npm test -- store/projectStore.test
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/store/projectStore.ts app/src/store/projectStore.test.ts
git commit -m "feat(store): add openProject action"
```

---

## Task 5: ProjectStore — openView / activateTab

**Files:**
- Modify: `app/src/store/projectStore.ts`
- Modify: `app/src/store/projectStore.test.ts`

- [ ] **Step 1: Write the failing tests for `openView`**

Append to `app/src/store/projectStore.test.ts`:
```ts
describe('openView', () => {
  beforeEach(() => {
    useProjectStore.getState().reset()
    useProjectStore.getState().openProject('/p', ['a.html', 'b.html', 'c.html'])
  })

  it('opens a new tab and activates it', () => {
    useProjectStore.getState().openView('a.html')
    const s = useProjectStore.getState()
    expect(s.openTabs).toEqual(['a.html'])
    expect(s.activeTab).toBe('a.html')
  })

  it('appends new tabs in click order', () => {
    useProjectStore.getState().openView('b.html')
    useProjectStore.getState().openView('a.html')
    const s = useProjectStore.getState()
    expect(s.openTabs).toEqual(['b.html', 'a.html'])
    expect(s.activeTab).toBe('a.html')
  })

  it('does not duplicate an already-open tab; just activates it', () => {
    useProjectStore.getState().openView('a.html')
    useProjectStore.getState().openView('b.html')
    useProjectStore.getState().openView('a.html')
    const s = useProjectStore.getState()
    expect(s.openTabs).toEqual(['a.html', 'b.html'])
    expect(s.activeTab).toBe('a.html')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd app
npm test -- store/projectStore.test
```

Expected: FAIL — `openView is not a function`.

- [ ] **Step 3: Implement `openView`**

Add to the `ProjectState` interface:
```ts
openView: (filename: string) => void
```

Add to the store body:
```ts
openView: (filename) =>
  set((state) => {
    const alreadyOpen = state.openTabs.includes(filename)
    return {
      openTabs: alreadyOpen ? state.openTabs : [...state.openTabs, filename],
      activeTab: filename,
    }
  }),
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd app
npm test -- store/projectStore.test
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/store/projectStore.ts app/src/store/projectStore.test.ts
git commit -m "feat(store): add openView action"
```

---

## Task 6: ProjectStore — closeTab and refreshViewList

**Files:**
- Modify: `app/src/store/projectStore.ts`
- Modify: `app/src/store/projectStore.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `app/src/store/projectStore.test.ts`:
```ts
describe('closeTab', () => {
  beforeEach(() => {
    useProjectStore.getState().reset()
    useProjectStore.getState().openProject('/p', ['a.html', 'b.html', 'c.html'])
    useProjectStore.getState().openView('a.html')
    useProjectStore.getState().openView('b.html')
    useProjectStore.getState().openView('c.html')
    // openTabs = [a, b, c], activeTab = c
  })

  it('removes the tab from openTabs', () => {
    useProjectStore.getState().closeTab('b.html')
    expect(useProjectStore.getState().openTabs).toEqual(['a.html', 'c.html'])
  })

  it('keeps activeTab unchanged when closing a non-active tab', () => {
    useProjectStore.getState().closeTab('a.html')
    expect(useProjectStore.getState().activeTab).toBe('c.html')
  })

  it('activates the right neighbor when closing the active tab', () => {
    useProjectStore.setState({ activeTab: 'a.html' })
    useProjectStore.getState().closeTab('a.html')
    expect(useProjectStore.getState().activeTab).toBe('b.html')
  })

  it('falls back to the left neighbor when closing the rightmost active tab', () => {
    // active is 'c.html' (rightmost) per beforeEach
    useProjectStore.getState().closeTab('c.html')
    expect(useProjectStore.getState().activeTab).toBe('b.html')
  })

  it('sets activeTab to null when closing the only tab', () => {
    useProjectStore.setState({ openTabs: ['only.html'], activeTab: 'only.html' })
    useProjectStore.getState().closeTab('only.html')
    const s = useProjectStore.getState()
    expect(s.openTabs).toEqual([])
    expect(s.activeTab).toBeNull()
  })
})

describe('refreshViewList', () => {
  beforeEach(() => {
    useProjectStore.getState().reset()
    useProjectStore.getState().openProject('/p', ['a.html'])
  })

  it('replaces viewList with sorted new entries; tabs untouched', () => {
    useProjectStore.getState().openView('a.html')
    useProjectStore.getState().refreshViewList(['z.html', 'a.html'])
    const s = useProjectStore.getState()
    expect(s.viewList).toEqual(['a.html', 'z.html'])
    expect(s.openTabs).toEqual(['a.html'])
    expect(s.activeTab).toBe('a.html')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd app
npm test -- store/projectStore.test
```

Expected: FAIL — `closeTab is not a function`, `refreshViewList is not a function`.

- [ ] **Step 3: Implement `closeTab` and `refreshViewList`**

Extend the `ProjectState` interface:
```ts
closeTab: (filename: string) => void
refreshViewList: (htmlFiles: string[]) => void
```

Add to the store body:
```ts
closeTab: (filename) =>
  set((state) => {
    const idx = state.openTabs.indexOf(filename)
    if (idx === -1) return state
    const nextTabs = state.openTabs.filter((t) => t !== filename)
    let nextActive = state.activeTab
    if (state.activeTab === filename) {
      if (nextTabs.length === 0) {
        nextActive = null
      } else {
        // Prefer right neighbor (same index), else left neighbor (idx - 1)
        nextActive = nextTabs[idx] ?? nextTabs[idx - 1] ?? null
      }
    }
    return { openTabs: nextTabs, activeTab: nextActive }
  }),

refreshViewList: (htmlFiles) =>
  set({ viewList: [...htmlFiles].sort((a, b) => a.localeCompare(b)) }),
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd app
npm test -- store/projectStore.test
```

Expected: PASS (12 tests total).

- [ ] **Step 5: Commit**

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/store/projectStore.ts app/src/store/projectStore.test.ts
git commit -m "feat(store): add closeTab and refreshViewList actions"
```

---

## Task 7: Tauri capabilities — fs and dialog permissions

**Files:**
- Modify: `app/src-tauri/capabilities/default.json`
- Modify: `app/src-tauri/src/lib.rs` (or `main.rs` depending on scaffold)
- Modify: `app/src-tauri/tauri.conf.json`

- [ ] **Step 1: Inspect what the scaffold gave you**

```bash
cat app/src-tauri/capabilities/default.json
cat app/src-tauri/src/lib.rs 2>/dev/null || cat app/src-tauri/src/main.rs
```

Note whether the Tauri builder is in `lib.rs` (newer scaffold) or `main.rs` (older). Use the file that contains `tauri::Builder::default()`.

- [ ] **Step 2: Register the fs and dialog plugins in Rust**

In the file that contains `tauri::Builder::default()`, find the line:
```rust
tauri::Builder::default()
```
and immediately after `default()` insert plugin registrations so it reads:
```rust
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
```

Keep the rest of the chain (`.invoke_handler(...)`, `.run(...)`) intact.

- [ ] **Step 3: Update capabilities to grant the needed permissions**

Replace `app/src-tauri/capabilities/default.json` contents with:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capabilities for the Delineation app",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    "dialog:allow-open",
    "fs:default",
    "fs:allow-read-text-file",
    "fs:allow-read-dir",
    "fs:allow-exists",
    "fs:allow-mkdir",
    "fs:allow-write-text-file",
    {
      "identifier": "fs:scope",
      "allow": [
        { "path": "$APPDATA/**" },
        { "path": "$APPDATA" },
        { "path": "$HOME/**" }
      ]
    }
  ]
}
```

(The `$HOME/**` scope is permissive but appropriate for an MVP that lets the user pick any folder. Tighten in a later spec.)

- [ ] **Step 4: Verify the app still launches**

```bash
cd app
npm run tauri dev
```

Expected: A native window opens with the scaffold page, no permission errors in the terminal. Close the window.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src-tauri/
git commit -m "feat(tauri): register fs+dialog plugins and grant capabilities"
```

---

## Task 8: Tauri fs wrapper module

**Files:**
- Create: `app/src/tauri/fs.ts`

This module is a thin async wrapper. It is exercised manually in the running Tauri app rather than unit-tested (the Tauri APIs require a runtime).

- [ ] **Step 1: Implement the wrapper**

Create `app/src/tauri/fs.ts`:
```ts
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, readTextFile } from '@tauri-apps/plugin-fs'
import { basename } from '@tauri-apps/api/path'

/** Opens a folder picker. Returns absolute path or null if cancelled. */
export async function pickFolder(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false })
  if (typeof result === 'string') return result
  return null
}

/** Lists `.html` files in the root of `projectPath`. Returns sorted filenames. */
export async function listHtmlFiles(projectPath: string): Promise<string[]> {
  const entries = await readDir(projectPath)
  return entries
    .filter((e) => e.isFile && e.name.toLowerCase().endsWith('.html'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))
}

/** Reads a view file's text contents. */
export async function readViewFile(projectPath: string, filename: string): Promise<string> {
  return readTextFile(`${projectPath}/${filename}`)
}

/** Returns the basename of a path (last segment). */
export async function pathBasename(path: string): Promise<string> {
  return basename(path)
}
```

- [ ] **Step 2: Type-check**

```bash
cd app
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/tauri/fs.ts
git commit -m "feat(tauri): add fs wrapper (pickFolder, listHtmlFiles, readViewFile)"
```

---

## Task 9: Last-project persistence

**Files:**
- Create: `app/src/tauri/persistence.ts`

- [ ] **Step 1: Implement persistence helpers**

Create `app/src/tauri/persistence.ts`:
```ts
import {
  readTextFile,
  writeTextFile,
  mkdir,
  exists,
  BaseDirectory,
} from '@tauri-apps/plugin-fs'

const CONFIG_FILE = 'config.json'

interface PersistedConfig {
  lastProject?: string | null
}

async function ensureAppDataDir(): Promise<void> {
  const dirExists = await exists('', { baseDir: BaseDirectory.AppData })
  if (!dirExists) {
    await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true })
  }
}

export async function loadLastProject(): Promise<string | null> {
  try {
    const text = await readTextFile(CONFIG_FILE, { baseDir: BaseDirectory.AppData })
    const cfg = JSON.parse(text) as PersistedConfig
    return cfg.lastProject ?? null
  } catch {
    return null
  }
}

export async function saveLastProject(path: string | null): Promise<void> {
  await ensureAppDataDir()
  const cfg: PersistedConfig = { lastProject: path }
  await writeTextFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), {
    baseDir: BaseDirectory.AppData,
  })
}
```

- [ ] **Step 2: Type-check**

```bash
cd app
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/tauri/persistence.ts
git commit -m "feat(tauri): add last-project persistence in app data dir"
```

---

## Task 10: Sample project seed assets and copy logic

**Files:**
- Create: `app/src-tauri/resources/sample-project/overview.html`
- Create: `app/src-tauri/resources/sample-project/data-flow.html`
- Create: `app/src-tauri/resources/sample-project/notes.html`
- Modify: `app/src-tauri/tauri.conf.json` (bundle resources)
- Create: `app/src/seed/seedSampleProject.ts`

- [ ] **Step 1: Author the three sample HTML files**

Create `app/src-tauri/resources/sample-project/overview.html`:
```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Overview</title>
<style>
body{font-family:system-ui,sans-serif;padding:32px;color:#222;line-height:1.5;max-width:760px}
svg{display:block;margin:24px 0}
.box{fill:#fff;stroke:#444;stroke-width:1.5}
.lbl{font-size:13px;fill:#222}
</style></head>
<body>
<h1>System Overview</h1>
<p>This is a sample architecture view. Each rectangle is a service; arrows show calls.</p>
<svg viewBox="0 0 520 200" width="520" height="200">
  <rect class="box" x="20" y="40" width="120" height="60" rx="6"/>
  <text class="lbl" x="80" y="75" text-anchor="middle">Client</text>
  <rect class="box" x="200" y="40" width="120" height="60" rx="6"/>
  <text class="lbl" x="260" y="75" text-anchor="middle">API Gateway</text>
  <rect class="box" x="380" y="40" width="120" height="60" rx="6"/>
  <text class="lbl" x="440" y="75" text-anchor="middle">Worker</text>
  <line x1="140" y1="70" x2="200" y2="70" stroke="#444" marker-end="url(#a)"/>
  <line x1="320" y1="70" x2="380" y2="70" stroke="#444" marker-end="url(#a)"/>
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#444"/></marker></defs>
</svg>
<p>Notes: the Worker pulls jobs from a queue (not shown). Latency budget: 200ms p95 for the gateway hop.</p>
</body></html>
```

Create `app/src-tauri/resources/sample-project/data-flow.html`:
```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Data Flow</title>
<style>
body{font-family:system-ui,sans-serif;padding:32px;color:#222;line-height:1.5;max-width:760px}
.node{display:inline-block;border:1.5px solid #444;border-radius:6px;padding:8px 14px;margin:4px;background:#fff}
.arrow{display:inline-block;margin:0 4px;color:#666}
</style></head>
<body>
<h1>Data Flow</h1>
<p>Ingest pipeline, left to right:</p>
<p>
  <span class="node">Source</span><span class="arrow">→</span>
  <span class="node">Validate</span><span class="arrow">→</span>
  <span class="node">Enrich</span><span class="arrow">→</span>
  <span class="node">Store</span>
</p>
<p>Failure mode: validation rejects route to a dead-letter topic; enrichment is idempotent so retries are safe.</p>
</body></html>
```

Create `app/src-tauri/resources/sample-project/notes.html`:
```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Notes</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;color:#222;line-height:1.5;max-width:760px}</style></head>
<body>
<h1>Notes</h1>
<p>This is a plain-prose view. In a real project this might capture decisions, open questions, or context that doesn't fit a diagram.</p>
<ul>
  <li>Open question: how do we version views?</li>
  <li>Decision: views are flat in the project root for the MVP.</li>
</ul>
</body></html>
```

- [ ] **Step 2: Tell Tauri to bundle the resources**

Open `app/src-tauri/tauri.conf.json`. Find the `bundle` section. Add a `resources` field listing the sample folder:

```json
"bundle": {
  "active": true,
  "targets": "all",
  "icon": [ /* keep existing */ ],
  "resources": [
    "resources/sample-project/*"
  ]
}
```

(Preserve any other existing keys under `bundle`.)

- [ ] **Step 3: Implement the seed copy logic**

Create `app/src/seed/seedSampleProject.ts`:
```ts
import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
  BaseDirectory,
} from '@tauri-apps/plugin-fs'
import { resolveResource, appDataDir, join } from '@tauri-apps/api/path'

const SAMPLE_FILES = ['overview.html', 'data-flow.html', 'notes.html']
const TARGET_DIRNAME = 'Sample Project'

/**
 * On first run, copy the bundled sample project into the app data dir.
 * Returns the absolute path of the sample project folder, or null if seeding failed.
 */
export async function seedSampleProjectIfMissing(): Promise<string | null> {
  try {
    const dataDir = await appDataDir()
    const targetDir = await join(dataDir, TARGET_DIRNAME)

    const alreadyThere = await exists(TARGET_DIRNAME, { baseDir: BaseDirectory.AppData })
    if (alreadyThere) return targetDir

    await mkdir(TARGET_DIRNAME, { baseDir: BaseDirectory.AppData, recursive: true })

    for (const name of SAMPLE_FILES) {
      const resPath = await resolveResource(`resources/sample-project/${name}`)
      const content = await readTextFile(resPath)
      await writeTextFile(`${TARGET_DIRNAME}/${name}`, content, {
        baseDir: BaseDirectory.AppData,
      })
    }

    return targetDir
  } catch (err) {
    console.error('seedSampleProject failed:', err)
    return null
  }
}
```

- [ ] **Step 4: Type-check**

```bash
cd app
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src-tauri/resources app/src-tauri/tauri.conf.json app/src/seed/
git commit -m "feat(seed): bundle sample project and add first-run copy logic"
```

---

## Task 11: EmptyState component

**Files:**
- Create: `app/src/components/EmptyState.tsx`

- [ ] **Step 1: Implement the component**

Create `app/src/components/EmptyState.tsx`:
```tsx
interface Props {
  onOpenProject: () => void
  onOpenSample: () => void
}

export function EmptyState({ onOpenProject, onOpenSample }: Props) {
  return (
    <div className="empty-state">
      <h1>Delineation</h1>
      <p>Open a Project folder to browse its Views.</p>
      <div className="empty-state-buttons">
        <button onClick={onOpenProject} className="primary">Open Project…</button>
        <button onClick={onOpenSample}>Open Sample Project</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/components/EmptyState.tsx
git commit -m "feat(ui): add EmptyState component"
```

---

## Task 12: TopBar component

**Files:**
- Create: `app/src/components/TopBar.tsx`

- [ ] **Step 1: Implement**

Create `app/src/components/TopBar.tsx`:
```tsx
interface Props {
  projectName: string | null
  onOpenProject: () => void
}

export function TopBar({ projectName, onOpenProject }: Props) {
  return (
    <header className="top-bar">
      <span className="project-name">{projectName ?? 'No Project'}</span>
      <button onClick={onOpenProject}>Open Project…</button>
    </header>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/components/TopBar.tsx
git commit -m "feat(ui): add TopBar component"
```

---

## Task 13: Sidebar component

**Files:**
- Create: `app/src/components/Sidebar.tsx`

- [ ] **Step 1: Implement**

Create `app/src/components/Sidebar.tsx`:
```tsx
interface Props {
  views: string[]
  activeView: string | null
  onSelect: (filename: string) => void
  onRefresh: () => void
}

function displayName(filename: string): string {
  return filename.replace(/\.html$/i, '')
}

export function Sidebar({ views, activeView, onSelect, onRefresh }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>Views</span>
        <button onClick={onRefresh} title="Re-scan project folder">Refresh</button>
      </div>
      <ul className="view-list">
        {views.length === 0 && <li className="empty-hint">No .html files found.</li>}
        {views.map((name) => (
          <li
            key={name}
            className={name === activeView ? 'active' : ''}
            onClick={() => onSelect(name)}
          >
            {displayName(name)}
          </li>
        ))}
      </ul>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/components/Sidebar.tsx
git commit -m "feat(ui): add Sidebar component"
```

---

## Task 14: TabStrip component

**Files:**
- Create: `app/src/components/TabStrip.tsx`

- [ ] **Step 1: Implement**

Create `app/src/components/TabStrip.tsx`:
```tsx
interface Props {
  tabs: string[]
  activeTab: string | null
  onActivate: (filename: string) => void
  onClose: (filename: string) => void
}

function displayName(filename: string): string {
  return filename.replace(/\.html$/i, '')
}

export function TabStrip({ tabs, activeTab, onActivate, onClose }: Props) {
  return (
    <div className="tab-strip">
      {tabs.map((name) => (
        <div
          key={name}
          className={`tab ${name === activeTab ? 'active' : ''}`}
          onClick={() => onActivate(name)}
        >
          <span>{displayName(name)}</span>
          <button
            className="close"
            onClick={(e) => { e.stopPropagation(); onClose(name) }}
            aria-label={`Close ${name}`}
          >×</button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/components/TabStrip.tsx
git commit -m "feat(ui): add TabStrip component"
```

---

## Task 15: ViewerPane component

**Files:**
- Create: `app/src/components/ViewerPane.tsx`

- [ ] **Step 1: Implement**

Create `app/src/components/ViewerPane.tsx`:
```tsx
interface Props {
  /** Raw HTML content for the active view, or null if no tab is active. */
  html: string | null
  /** Used as the iframe key so React remounts on tab switch. */
  viewKey: string | null
}

export function ViewerPane({ html, viewKey }: Props) {
  if (html === null) {
    return (
      <div className="viewer-empty">
        <p>No view open. Pick one from the sidebar.</p>
      </div>
    )
  }
  return (
    <iframe
      key={viewKey ?? 'none'}
      className="viewer-iframe"
      sandbox=""
      srcDoc={html}
      title={viewKey ?? 'view'}
    />
  )
}
```

The strict `sandbox=""` matches the spec's static-render decision (no scripts, no same-origin).

- [ ] **Step 2: Commit**

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/components/ViewerPane.tsx
git commit -m "feat(ui): add ViewerPane (sandboxed iframe)"
```

---

## Task 16: App composition — wire everything together

**Files:**
- Modify: `app/src/App.tsx` (replace scaffold contents)
- Create: `app/src/styles.css`
- Modify: `app/src/main.tsx` (ensure styles import)

- [ ] **Step 1: Replace `App.tsx` with the wired version**

Overwrite `app/src/App.tsx` with:
```tsx
import { useEffect, useState } from 'react'
import { useProjectStore } from './store/projectStore'
import { pickFolder, listHtmlFiles, readViewFile, pathBasename } from './tauri/fs'
import { loadLastProject, saveLastProject } from './tauri/persistence'
import { seedSampleProjectIfMissing } from './seed/seedSampleProject'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { TabStrip } from './components/TabStrip'
import { ViewerPane } from './components/ViewerPane'
import { EmptyState } from './components/EmptyState'

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

  const [projectName, setProjectName] = useState<string | null>(null)
  const [activeHtml, setActiveHtml] = useState<string | null>(null)

  // On startup: try to restore the last project.
  useEffect(() => {
    ;(async () => {
      const last = await loadLastProject()
      if (last) await tryOpenProjectAt(last)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update the project name display whenever currentProject changes.
  useEffect(() => {
    ;(async () => {
      setProjectName(currentProject ? await pathBasename(currentProject) : null)
    })()
  }, [currentProject])

  // Load the active tab's HTML whenever activeTab or currentProject changes.
  useEffect(() => {
    ;(async () => {
      if (!currentProject || !activeTab) {
        setActiveHtml(null)
        return
      }
      try {
        const html = await readViewFile(currentProject, activeTab)
        setActiveHtml(html)
      } catch (err) {
        console.error('readViewFile failed:', err)
        setActiveHtml(`<p style="font-family:sans-serif;padding:24px;color:#a00">Failed to read ${activeTab}: ${String(err)}</p>`)
      }
    })()
  }, [currentProject, activeTab])

  async function tryOpenProjectAt(path: string) {
    try {
      const files = await listHtmlFiles(path)
      openProject(path, files)
      await saveLastProject(path)
    } catch (err) {
      console.error('Failed to open project:', err)
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
      const files = await listHtmlFiles(currentProject)
      refreshViewList(files)
    } catch (err) {
      console.error('refresh failed:', err)
    }
  }

  if (!currentProject) {
    return (
      <EmptyState
        onOpenProject={handleOpenProject}
        onOpenSample={handleOpenSample}
      />
    )
  }

  return (
    <div className="app">
      <TopBar projectName={projectName} onOpenProject={handleOpenProject} />
      <div className="app-body">
        <Sidebar
          views={viewList}
          activeView={activeTab}
          onSelect={openView}
          onRefresh={handleRefresh}
        />
        <main className="viewer">
          <TabStrip
            tabs={openTabs}
            activeTab={activeTab}
            onActivate={openView}
            onClose={closeTab}
          />
          <ViewerPane html={activeHtml} viewKey={activeTab} />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add minimal stylesheet**

Create `app/src/styles.css`:
```css
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body { font-family: system-ui, -apple-system, sans-serif; color: #1e1e1e; background: #fafafa; }

.app { display: flex; flex-direction: column; height: 100%; }
.app-body { display: flex; flex: 1; min-height: 0; }

.top-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px; border-bottom: 1px solid #ddd; background: #fff;
}
.project-name { font-weight: 600; }

.sidebar {
  width: 240px; border-right: 1px solid #ddd; background: #f4f4f4;
  display: flex; flex-direction: column;
}
.sidebar-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px; border-bottom: 1px solid #e3e3e3; font-size: 12px;
  text-transform: uppercase; letter-spacing: 0.04em; color: #666;
}
.view-list { list-style: none; margin: 0; padding: 4px 0; overflow-y: auto; flex: 1; }
.view-list li { padding: 6px 14px; cursor: pointer; }
.view-list li:hover { background: #e9e9e9; }
.view-list li.active { background: #d8e4ff; color: #1c4ad6; }
.empty-hint { color: #888; font-style: italic; }

.viewer { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.tab-strip {
  display: flex; border-bottom: 1px solid #ddd; background: #fff;
  overflow-x: auto;
}
.tab {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-right: 1px solid #eee; cursor: pointer;
  white-space: nowrap;
}
.tab.active { background: #fafafa; border-bottom: 2px solid #1c4ad6; }
.tab .close {
  border: none; background: transparent; cursor: pointer;
  font-size: 14px; padding: 0 4px; color: #888;
}
.tab .close:hover { color: #c00; }

.viewer-iframe { flex: 1; border: none; background: #fff; }
.viewer-empty {
  flex: 1; display: flex; align-items: center; justify-content: center; color: #888;
}

.empty-state {
  height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 16px; padding: 24px;
}
.empty-state-buttons { display: flex; gap: 12px; }
button { padding: 6px 12px; border: 1px solid #bbb; background: #fff; border-radius: 4px; cursor: pointer; }
button.primary { background: #1c4ad6; color: #fff; border-color: #1c4ad6; }
button:hover { filter: brightness(0.97); }
```

- [ ] **Step 3: Import the stylesheet in `main.tsx`**

In `app/src/main.tsx`, ensure there is an import line:
```ts
import './styles.css'
```
(Place it near the other imports. Remove the import of any default scaffold CSS like `App.css` if it's no longer used.)

- [ ] **Step 4: Type-check and run unit tests**

```bash
cd app
npx tsc --noEmit
npm test
```

Expected: No type errors. All 12 store tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git add app/src/App.tsx app/src/styles.css app/src/main.tsx
git commit -m "feat: wire App with TopBar/Sidebar/TabStrip/ViewerPane and empty state"
```

---

## Task 17: Manual acceptance verification

This task has no test code; it is a checklist the engineer runs in the actual app to confirm the spec's success criteria.

- [ ] **Step 1: Launch the app**

```bash
cd app
npm run tauri dev
```

Wait until the native window opens.

- [ ] **Step 2: First-run empty state**

Expected: The app shows the EmptyState page with "Open Project…" and "Open Sample Project" buttons.

- [ ] **Step 3: Open Sample Project**

Click "Open Sample Project". Expected:
- Top bar shows project name `Sample Project`.
- Sidebar lists three views: `data-flow`, `notes`, `overview` (alphabetical).
- No tabs open.

- [ ] **Step 4: Open and switch views**

Click `overview` → tab opens, iframe shows the system overview SVG diagram.
Click `data-flow` → second tab opens and activates; iframe shows the data flow node chain.
Click the `overview` tab → activates without re-adding.
Click `overview` in sidebar again → tab stays single (no duplicate); already active.

- [ ] **Step 5: Close tabs**

Close the active `overview` tab → `data-flow` becomes active automatically.
Open `notes`, then close `data-flow` (currently inactive) → `notes` remains active.
Close the last remaining tab → viewer shows "No view open." empty message.

- [ ] **Step 6: Refresh button**

In the sidebar, click "Refresh". Expected: list re-populates without errors (still three entries).

External-edit test: in your file manager, add a file `extra.html` to the Sample Project folder (any HTML), click Refresh in-app. Expected: `extra` appears in the sidebar. Click it → renders.

- [ ] **Step 7: Persistence**

Close the Tauri window. Re-run `npm run tauri dev`. Expected: app launches directly into the Sample Project view (no empty state) — sidebar populated, no tabs open.

- [ ] **Step 8: Open a different Project**

Click "Open Project…" in the top bar. Pick any folder containing `.html` files (or an empty folder). Expected:
- If the folder has `.html` files: sidebar lists them.
- If empty: sidebar shows "No .html files found."
- After restart, the most recently opened folder is restored.

- [ ] **Step 9: Sandbox check**

Open `overview` (or any view). The iframe should render the SVG without errors. Open the dev tools (right-click → Inspect, or the Tauri menu) and confirm no JavaScript ran in the iframe (try adding a `<script>alert(1)</script>` to a sample file and refreshing — the alert should NOT fire because `sandbox=""` blocks scripts).

- [ ] **Step 10: Commit acceptance log**

If anything failed, fix it and recommit. If everything passed, mark the milestone:

```bash
cd /Users/zhuhuifeng/Projects/Delineation-Workspace
git tag mvp-skeleton -m "MVP skeleton acceptance passed"
```

---

## Out of Scope (per spec)

These are intentionally **not** in this plan and should not be added:

- A2UI runtime / interactive callbacks
- View editor of any kind
- File watcher / automatic refresh
- Subfolder support
- Search, links between views, tags
- Multiple Projects open simultaneously
- Composition vs Orientation mode separation
- Plugin system
- Remote Agent integration

Each of these gets its own brainstorm → spec → plan cycle later.
