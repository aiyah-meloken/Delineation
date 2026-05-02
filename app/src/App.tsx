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
