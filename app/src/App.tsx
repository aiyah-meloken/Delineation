import { useEffect, useState } from 'react'
import { useProjectStore } from './store/projectStore'
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
import { emptyGraph, isValidA2UIGraph, type A2UIGraph } from './a2ui/schema'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { TabStrip } from './components/TabStrip'
import { ViewerPane } from './components/ViewerPane'
import { TerminalPanel } from './components/TerminalPanel'
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

  const canvas = useCanvasStore()

  const [projectName, setProjectName] = useState<string | null>(null)
  const [activeHtml, setActiveHtml] = useState<string | null>(null)

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

  function handleCloseTab(filename: string) {
    closeTab(filename)
    canvas.discard(filename)
    // TerminalPanel unmounts on closeTab and calls killTerminal in its own cleanup.
  }

  function handleGraphReady(graph: A2UIGraph) {
    if (!activeTab || !currentProject) return
    canvas.setGraph(activeTab, graph)
    writeViewGraph(currentProject, activeTab, graph).catch((err) =>
      console.error('writeViewGraph failed:', err),
    )
  }

  if (!currentProject) {
    return (
      <EmptyState onOpenProject={handleOpenProject} onOpenSample={handleOpenSample} />
    )
  }

  const isCanvas = activeTab?.toLowerCase().endsWith('.a2ui.json') ?? false

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
            />
            {isCanvas && activeTab && currentProject && (
              <TerminalPanel
                projectPath={currentProject}
                paneKey={activeTab}
                onGraphReady={handleGraphReady}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
