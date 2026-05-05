import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useProjectStore } from './store/projectStore'
import { useCanvasStore } from './store/canvasStore'
import {
  pickFolder,
  createProjectFolder,
  deleteProjectFolder,
  deleteProjectView,
  listProjectFolders,
  listProjectViews,
  initializeProjectDirectory,
  isProjectDirectory,
  readProjectMetadata,
  readViewFile,
  pathBasename,
  renameProjectFolder,
  renameProjectView,
  writeViewText,
} from './tauri/fs'
import { loadLastProject, loadWindowSize, saveLastProject, saveWindowSize } from './tauri/persistence'
import { seedSampleProjectIfMissing } from './seed/seedSampleProject'
import type { A2UIGraph } from './a2ui/schema'
import {
  createA2UIViewDocument,
  legacyGraphToViewDocument,
  parseA2UIViewText,
  type A2UIViewDocument,
} from './a2ui/view'
import { Sidebar } from './components/Sidebar'
import { TabStrip } from './components/TabStrip'
import { ViewerPane } from './components/ViewerPane'
import { TerminalPanel } from './components/TerminalPanel'
import { EmptyState } from './components/EmptyState'
import { ProjectGuideDialog, type ProjectGuideState } from './components/ProjectGuideDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { folderForNewChild, moveViewPath } from './project/viewTree'
import {
  activatePaneTab,
  closePaneTab,
  createEmptyPane,
  deletePaneFolder,
  openPaneTab,
  renamePaneFolder,
  renamePaneTab,
  reorderPaneTab,
  type ViewPane,
} from './project/viewPanes'
import {
  closeTerminalSession,
  createTerminalSession,
  renameTerminalSession,
  type TerminalProfile,
  type TerminalSession,
} from './terminal/sessionModel'
import { listTerminalProfiles } from './tauri/term'
import {
  getViewVersion,
  listLensKits,
  listViewVersions,
  onControlViewChanged,
  setControlContext,
  startControl,
  type LensKitInfo,
  type ViewVersionInfo,
} from './tauri/control'
import { openInspector, reloadApp } from './tauri/inspector'
import {
  checkAndDownloadUpdate,
  initialUpdateState,
  installUpdateAndRelaunch,
  readAppInfo,
  startUpdateCheckLoop,
  type AppInfo,
  type UpdateState,
} from './tauri/update'
import type { Update } from '@tauri-apps/plugin-updater'

const SIDEBAR_WIDTH_KEY = 'delineation.sidebarWidth.obsidianLayout'
const TERMINAL_HEIGHT_KEY = 'delineation.terminalHeight'
const TERMINAL_SESSION_WIDTH_KEY = 'delineation.terminalSessionWidth'
const DEFAULT_TERMINAL_PROFILE: TerminalProfile = { id: 'shell', label: 'zsh' }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function readStoredNumber(key: string, fallback: number): number {
  const raw = window.localStorage.getItem(key)
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function writeStoredNumber(key: string, value: number) {
  window.localStorage.setItem(key, String(Math.round(value)))
}

async function storeCurrentTauriWindowSize() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const appWindow = getCurrentWindow()
  const [size, scaleFactor] = await Promise.all([
    appWindow.innerSize(),
    appWindow.scaleFactor(),
  ])
  const logical = size.toLogical(scaleFactor)
  await saveWindowSize(logical.width, logical.height)
}

function joinRelativePath(folder: string, name: string): string {
  const cleanFolder = folder.replace(/^\/+|\/+$/g, '')
  const cleanName = name.replace(/^\/+|\/+$/g, '')
  return cleanFolder ? `${cleanFolder}/${cleanName}` : cleanName
}

function parentFolderPath(folderPath: string): string {
  const clean = folderPath.replace(/^\/+|\/+$/g, '')
  const slash = clean.lastIndexOf('/')
  return slash === -1 ? '' : clean.slice(0, slash)
}

function normalizeNameInput(input: string | null): string | null {
  const name = input?.trim()
  if (!name) return null
  return name.replace(/[\\/]/g, '-')
}

function ensureA2UIFilename(name: string): string {
  if (name.toLowerCase().endsWith('.a2ui.json')) return name
  if (name.toLowerCase().endsWith('.html')) return name.replace(/\.html$/i, '.a2ui.json')
  return `${name}.a2ui.json`
}

function newTerminalSessionId(): string {
  return `terminal-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function paneIdForTab(panes: ViewPane[], filename: string): string | null {
  return panes.find((pane) => pane.tabs.includes(filename))?.id ?? null
}

function displayViewName(filename: string): string {
  return filename.replace(/\.a2ui\.json$/i, '').replace(/\.html$/i, '')
}

function appTitle(projectName: string | null, activeTab: string | null): string {
  if (projectName && activeTab) return `${displayViewName(activeTab)} - ${projectName} - Delineation`
  if (projectName) return `${projectName} - Delineation`
  return 'Delineation'
}

function ViewPaneContent({
  projectPath,
  filename,
  reloadKey,
}: {
  projectPath: string
  filename: string | null
  reloadKey: number
}) {
  const graph = useCanvasStore((state) => filename ? state.graphs[filename] ?? null : null)
  const setGraph = useCanvasStore((state) => state.setGraph)
  const [html, setHtml] = useState<string | null>(null)
  const [a2uiView, setA2uiView] = useState<A2UIViewDocument | null>(null)
  const [versions, setVersions] = useState<ViewVersionInfo[]>([])
  const [currentA2uiView, setCurrentA2uiView] = useState<A2UIViewDocument | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setHtml(null)
      setA2uiView(null)
      setCurrentA2uiView(null)
      setSelectedVersionId(null)
      setParseError(null)
      setVersions([])
      if (!filename) return
      try {
        const text = await readViewFile(projectPath, filename)
        if (cancelled) return
        if (filename.toLowerCase().endsWith('.html')) {
          setHtml(text)
        } else if (filename.toLowerCase().endsWith('.a2ui.json')) {
          if (text.trim().length === 0) {
            setA2uiView(createA2UIViewDocument(displayViewName(filename)))
            return
          }
          const parsed = parseA2UIViewText(text)
          if (parsed.kind === 'a2ui-view') {
            setA2uiView(parsed.document)
            setCurrentA2uiView(parsed.document)
          } else {
            setGraph(filename, parsed.graph)
          }
          try {
            const nextVersions = await listViewVersions(projectPath, filename)
            if (!cancelled) setVersions(nextVersions)
          } catch {
            // Browser preview / old projects can render without version metadata.
          }
        }
      } catch (err) {
        console.error('readViewFile failed:', err)
        if (!cancelled) {
          if (filename.toLowerCase().endsWith('.html')) {
            setHtml(`<p style="font-family:sans-serif;padding:24px;color:#a00">Failed to read ${filename}: ${String(err)}</p>`)
          } else {
            setParseError(String(err))
          }
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectPath, filename, reloadKey, setGraph])

  async function handleSelectVersion(versionId: string) {
    if (!filename) return
    try {
      const text = await getViewVersion(projectPath, filename, versionId)
      const parsed = parseA2UIViewText(text)
      if (parsed.kind === 'a2ui-view') {
        setA2uiView(parsed.document)
        setSelectedVersionId(versionId)
      }
    } catch (err) {
      console.error('getViewVersion failed:', err)
    }
  }

  function handleShowCurrentVersion() {
    if (currentA2uiView) setA2uiView(currentA2uiView)
    setSelectedVersionId(null)
  }

  return (
    <ViewerPane
      filename={filename}
      html={html}
      graph={graph}
      a2uiView={a2uiView}
      parseError={parseError}
      versions={versions}
      selectedVersionId={selectedVersionId}
      onSelectVersion={handleSelectVersion}
      onShowCurrentVersion={handleShowCurrentVersion}
    />
  )
}

export default function App() {
  const {
    currentProject,
    viewList,
    activeTab,
    openProject,
    openView,
    closeTab,
    refreshViewList,
    renameView,
    renameFolder,
    deleteFolder,
  } = useProjectStore()

  const canvas = useCanvasStore()

  const downloadedUpdateRef = useRef<Update | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo>({ name: 'Delineation', version: '0.1.5' })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [updateState, setUpdateState] = useState<UpdateState>(initialUpdateState)
  const [lensKits, setLensKits] = useState<LensKitInfo[]>([])
  const [viewReloadKey, setViewReloadKey] = useState(0)
  const [appContextMenu, setAppContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [projectGuide, setProjectGuide] = useState<ProjectGuideState | null>(null)
  const [viewPanes, setViewPanes] = useState<ViewPane[]>(() => [createEmptyPane('pane-1')])
  const [activePaneId, setActivePaneId] = useState('pane-1')
  const [folderList, setFolderList] = useState<string[]>([])
  const [selectedFolder, setSelectedFolder] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    clamp(readStoredNumber(SIDEBAR_WIDTH_KEY, 360), 280, 560),
  )
  const [terminalHeight, setTerminalHeight] = useState(() =>
    clamp(readStoredNumber(TERMINAL_HEIGHT_KEY, 240), 150, 520),
  )
  const [terminalSessionWidth, setTerminalSessionWidth] = useState(() =>
    clamp(readStoredNumber(TERMINAL_SESSION_WIDTH_KEY, 190), 140, 320),
  )
  const [terminalProfiles, setTerminalProfiles] = useState<TerminalProfile[]>([DEFAULT_TERMINAL_PROFILE])
  const [terminalProfileMenuOpen, setTerminalProfileMenuOpen] = useState(false)
  const [renamingTerminalSession, setRenamingTerminalSession] = useState<{
    id: string
    value: string
  } | null>(null)
  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>(() => {
    const session = createTerminalSession([], newTerminalSessionId(), DEFAULT_TERMINAL_PROFILE)
    return [session]
  })
  const [activeTerminalSessionId, setActiveTerminalSessionId] = useState<string | null>(() =>
    terminalSessions[0]?.id ?? null,
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const info = await readAppInfo()
      if (!cancelled) setAppInfo(info)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return startUpdateCheckLoop({
      check: checkAndDownloadUpdate,
      onState: setUpdateState,
      onUpdateReady: (update) => {
        downloadedUpdateRef.current = update
      },
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    let unlistenTauriResize: (() => void) | null = null
    let tauriResizeTimer: number | null = null

    ;(async () => {
      try {
        const [storedSize, { getCurrentWindow }, { LogicalSize }] = await Promise.all([
          loadWindowSize(),
          import('@tauri-apps/api/window'),
          import('@tauri-apps/api/dpi'),
        ])
        if (cancelled) return
        const appWindow = getCurrentWindow()
        if (storedSize) {
          await getCurrentWindow().setSize(new LogicalSize(storedSize.width, storedSize.height))
        }
        unlistenTauriResize = await appWindow.onResized(() => {
          if (tauriResizeTimer !== null) window.clearTimeout(tauriResizeTimer)
          tauriResizeTimer = window.setTimeout(() => {
            tauriResizeTimer = null
            storeCurrentTauriWindowSize().catch(() => {
              saveWindowSize(window.innerWidth, window.innerHeight).catch(() => {})
            })
          }, 180)
        })
      } catch {
        // Browser preview falls back to DOM resize events below.
      }
    })()

    let resizeTimer: number | null = null
    function handleResize() {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null
        saveWindowSize(window.innerWidth, window.innerHeight).catch(() => {})
      }, 180)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      cancelled = true
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      if (tauriResizeTimer !== null) window.clearTimeout(tauriResizeTimer)
      unlistenTauriResize?.()
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    function handleContextMenu(event: MouseEvent) {
      if (event.defaultPrevented) return
      event.preventDefault()
      setAppContextMenu({ x: event.clientX, y: event.clientY })
    }

    function closeContextMenu() {
      setAppContextMenu(null)
    }

    document.addEventListener('contextmenu', handleContextMenu)
    window.addEventListener('click', closeContextMenu)
    window.addEventListener('keydown', closeContextMenu)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
      window.removeEventListener('click', closeContextMenu)
      window.removeEventListener('keydown', closeContextMenu)
    }
  }, [])

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
      try {
        const profiles = await listTerminalProfiles()
        if (profiles.length > 0) setTerminalProfiles(profiles)
      } catch (err) {
        console.error('listTerminalProfiles failed:', err)
      }
    })()
  }, [])

  useEffect(() => {
    ;(async () => {
      if (!currentProject) {
        setProjectName(null)
        setLensKits([])
        return
      }
      try {
        setProjectName((await readProjectMetadata(currentProject)).name)
      } catch {
        setProjectName(await pathBasename(currentProject))
      }
    })()
  }, [currentProject])

  useEffect(() => {
    const title = appTitle(projectName, activeTab)
    document.title = title
    ;(async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        await getCurrentWindow().setTitle(title)
      } catch {
        // Browser preview has no native window to rename.
      }
    })()
  }, [projectName, activeTab])

  async function openInitializedProject(path: string): Promise<boolean> {
    try {
      await startControl(path)
      const [files, folders, kits] = await Promise.all([
        listProjectViews(path),
        listProjectFolders(path),
        listLensKits(path),
      ])
      openProject(path, files)
      setViewPanes([createEmptyPane('pane-1')])
      setActivePaneId('pane-1')
      setFolderList(folders)
      setLensKits(kits)
      setSelectedFolder('')
      await saveLastProject(path)
      return true
    } catch (err) {
      console.error('Failed to open project:', err)
      setProjectGuide((current) => current ? {
        ...current,
        error: `Failed to open Project: ${String(err)}`,
      } : current)
      return false
    }
  }

  useEffect(() => {
    setControlContext(currentProject, activeTab).catch(() => {})
  }, [currentProject, activeTab])

  useEffect(() => {
    if (!currentProject) return
    let unsub: (() => void) | null = null
    let cancelled = false

    ;(async () => {
      unsub = await onControlViewChanged(async ({ viewPath }) => {
        if (cancelled) return
        try {
          const [files, folders, kits] = await Promise.all([
            listProjectViews(currentProject),
            listProjectFolders(currentProject),
            listLensKits(currentProject),
          ])
          refreshViewList(files)
          setFolderList(folders)
          setLensKits(kits)
          setViewReloadKey((key) => key + 1)
          if (files.includes(viewPath)) handleOpenView(viewPath)
        } catch (err) {
          console.error('control view refresh failed:', err)
        }
      })
    })().catch((err) => console.error('control listener failed:', err))

    return () => {
      cancelled = true
      unsub?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject])

  async function tryOpenProjectAt(path: string): Promise<boolean> {
    try {
      if (await isProjectDirectory(path)) return openInitializedProject(path)
      return false
    } catch {
      return false
    }
  }

  async function showProjectGuide(path: string, mode: ProjectGuideState['mode']) {
    setProjectGuide({
      mode,
      path,
      name: await pathBasename(path),
      error: null,
    })
  }

  async function chooseProjectGuideFolder() {
    const path = await pickFolder('Choose Project Folder')
    if (!path) return
    try {
      const isProject = await isProjectDirectory(path)
      setProjectGuide((current) => ({
        mode: isProject ? 'already-project' : current?.mode === 'initialize' ? 'initialize' : 'create',
        path,
        name: current?.name?.trim() ? current.name : '',
        error: null,
      }))
      if (!projectGuide?.name?.trim()) {
        const basename = await pathBasename(path)
        setProjectGuide((current) => current ? { ...current, name: basename } : current)
      }
    } catch (err) {
      setProjectGuide((current) => current ? {
        ...current,
        path,
        error: `Failed to inspect folder: ${String(err)}`,
      } : current)
    }
  }

  async function handleOpenProject() {
    const path = await pickFolder('Open Delineation Project')
    if (!path) return
    if (await tryOpenProjectAt(path)) return
    await showProjectGuide(path, 'initialize')
  }

  async function handleNewProject() {
    setProjectGuide({
      mode: 'create',
      path: null,
      name: '',
      error: null,
    })
  }

  async function handleOpenGuidedProject() {
    if (!projectGuide?.path) return
    const opened = await openInitializedProject(projectGuide.path)
    if (opened) setProjectGuide(null)
  }

  async function handleInitializeGuidedProject() {
    if (!projectGuide?.path) return
    const name = normalizeNameInput(projectGuide.name)
    if (!name) {
      setProjectGuide({ ...projectGuide, error: 'Project name is required.' })
      return
    }
    try {
      await initializeProjectDirectory(projectGuide.path, name)
      const opened = await openInitializedProject(projectGuide.path)
      if (opened) setProjectGuide(null)
    } catch (err) {
      console.error('handleInitializeGuidedProject failed:', err)
      setProjectGuide({ ...projectGuide, error: `Failed to initialize Project: ${String(err)}` })
    }
  }

  async function handleOpenSample() {
    const samplePath = await seedSampleProjectIfMissing()
    if (samplePath) await tryOpenProjectAt(samplePath)
  }

  async function handleNewCanvas(folderOverride: string | undefined, rawName: string) {
    if (!currentProject) return
    const normalized = normalizeNameInput(rawName)
    if (!normalized) return

    const folder = folderOverride ?? selectedFolder
    const baseName = ensureA2UIFilename(normalized)
    let name = joinRelativePath(folder, baseName)
    let i = 1
    while (viewList.includes(name)) {
      const stem = baseName.replace(/\.a2ui\.json$/i, '')
      name = joinRelativePath(folder, `${stem}-${i}.a2ui.json`)
      i += 1
    }
    try {
      await writeViewText(
        currentProject,
        name,
        JSON.stringify(createA2UIViewDocument(displayViewName(name)), null, 2),
      )
      const [files, folders] = await Promise.all([
        listProjectViews(currentProject),
        listProjectFolders(currentProject),
      ])
      refreshViewList(files)
      setFolderList(folders)
      handleOpenView(name)
      setSelectedFolder(folderForNewChild(name))
    } catch (err) {
      console.error('handleNewCanvas failed:', err)
    }
  }

  async function handleNewFolder(folderOverride: string | undefined, rawName: string) {
    if (!currentProject) return
    const normalized = normalizeNameInput(rawName)
    if (!normalized) return

    const folderPath = joinRelativePath(folderOverride ?? selectedFolder, normalized)
    try {
      await createProjectFolder(currentProject, folderPath)
      setSelectedFolder(folderPath)
      const folders = await listProjectFolders(currentProject)
      setFolderList(folders)
    } catch (err) {
      console.error('handleNewFolder failed:', err)
    }
  }

  async function handleRenameFolder(folderPath: string, rawName: string) {
    if (!currentProject) return
    const normalized = normalizeNameInput(rawName)
    if (!normalized) return

    const parent = parentFolderPath(folderPath)
    const nextPath = joinRelativePath(parent, normalized)
    if (nextPath === folderPath) return
    if (folderList.includes(nextPath)) {
      window.alert(`A Folder named "${normalized}" already exists here.`)
      return
    }
    if (nextPath.startsWith(`${folderPath}/`)) {
      window.alert('A Folder cannot be moved into itself.')
      return
    }

    try {
      await renameProjectFolder(currentProject, folderPath, nextPath)
      renameFolder(folderPath, nextPath)
      setViewPanes((panes) => renamePaneFolder(panes, folderPath, nextPath))
      canvas.renamePrefix(folderPath, nextPath)
      const [files, folders] = await Promise.all([
        listProjectViews(currentProject),
        listProjectFolders(currentProject),
      ])
      refreshViewList(files)
      setFolderList(folders)
      setSelectedFolder(nextPath)
    } catch (err) {
      console.error('handleRenameFolder failed:', err)
      window.alert(`Failed to rename Folder: ${String(err)}`)
    }
  }

  async function handleDeleteFolder(folderPath: string) {
    if (!currentProject) return
    const ok = window.confirm(`Delete Folder "${folderPath}"?\n\nThis removes the folder and everything inside it from disk.`)
    if (!ok) return

    try {
      await deleteProjectFolder(currentProject, folderPath)
      deleteFolder(folderPath)
      setViewPanes((panes) => deletePaneFolder(panes, folderPath))
      canvas.discardPrefix(folderPath)
      const [files, folders] = await Promise.all([
        listProjectViews(currentProject),
        listProjectFolders(currentProject),
      ])
      refreshViewList(files)
      setFolderList(folders)
      setSelectedFolder('')
    } catch (err) {
      console.error('handleDeleteFolder failed:', err)
      window.alert(`Failed to delete Folder: ${String(err)}`)
    }
  }

  function handleOpenView(filename: string) {
    setSelectedFolder(folderForNewChild(filename))
    const existingPaneId = paneIdForTab(viewPanes, filename)
    const nextActivePaneId = existingPaneId ?? activePaneId
    setActivePaneId(nextActivePaneId)
    setViewPanes((panes) => openPaneTab(panes, nextActivePaneId, filename))
    openView(filename)
  }

  async function handleDeleteView(filename: string) {
    if (!currentProject) return
    const ok = window.confirm(`Delete View "${displayViewName(filename)}"?\n\nThis removes the file from disk.`)
    if (!ok) return

    try {
      await deleteProjectView(currentProject, filename)
      const nextPanes = closePaneTab(viewPanes, filename)
      setViewPanes(nextPanes)
      const fallbackActivePane = nextPanes.find((pane) => pane.id === activePaneId) ?? nextPanes[0]
      setActivePaneId(fallbackActivePane.id)
      closeTab(filename)
      if (fallbackActivePane.activeTab) openView(fallbackActivePane.activeTab)
      canvas.discard(filename)
      const [files, folders] = await Promise.all([
        listProjectViews(currentProject),
        listProjectFolders(currentProject),
      ])
      refreshViewList(files)
      setFolderList(folders)
      setSelectedFolder(folderForNewChild(filename))
    } catch (err) {
      console.error('handleDeleteView failed:', err)
      window.alert(`Failed to delete View: ${String(err)}`)
    }
  }

  async function handleRenameView(filename: string, rawName: string) {
    if (!currentProject) return
    const normalized = normalizeNameInput(rawName)
    if (!normalized) return

    const folder = folderForNewChild(filename)
    const extension = filename.toLowerCase().endsWith('.html') ? '.html' : '.a2ui.json'
    const baseName = normalized.toLowerCase().endsWith(extension) ? normalized : `${normalized}${extension}`
    const nextName = joinRelativePath(folder, baseName)
    if (nextName === filename) return
    if (viewList.includes(nextName)) {
      window.alert(`A View named "${baseName}" already exists in this folder.`)
      return
    }

    try {
      await renameProjectView(currentProject, filename, nextName)
      renameView(filename, nextName)
      setViewPanes((panes) => renamePaneTab(panes, filename, nextName))
      canvas.rename(filename, nextName)
      const [files, folders] = await Promise.all([
        listProjectViews(currentProject),
        listProjectFolders(currentProject),
      ])
      refreshViewList(files)
      setFolderList(folders)
      setSelectedFolder(folderForNewChild(nextName))
    } catch (err) {
      console.error('handleRenameView failed:', err)
      window.alert(`Failed to rename View: ${String(err)}`)
    }
  }

  async function handleMoveView(filename: string, targetFolder: string) {
    if (!currentProject) return
    const nextName = moveViewPath(filename, targetFolder)
    if (nextName === filename) return
    if (viewList.includes(nextName)) {
      window.alert(`A View named "${displayViewName(nextName)}" already exists in this folder.`)
      return
    }

    try {
      await renameProjectView(currentProject, filename, nextName)
      renameView(filename, nextName)
      setViewPanes((panes) => renamePaneTab(panes, filename, nextName))
      canvas.rename(filename, nextName)
      const [files, folders] = await Promise.all([
        listProjectViews(currentProject),
        listProjectFolders(currentProject),
      ])
      refreshViewList(files)
      setFolderList(folders)
      setSelectedFolder(targetFolder)
    } catch (err) {
      console.error('handleMoveView failed:', err)
      window.alert(`Failed to move View: ${String(err)}`)
    }
  }

  function handleActivatePaneTab(paneId: string, filename: string) {
    setActivePaneId(paneId)
    setSelectedFolder(folderForNewChild(filename))
    setViewPanes((panes) => activatePaneTab(panes, paneId, filename))
    openView(filename)
  }

  function handleClosePaneTab(paneId: string, filename: string) {
    const nextPanes = closePaneTab(viewPanes, filename, paneId)
    setViewPanes(nextPanes)
    const fallbackActivePane = nextPanes.find((pane) => pane.id === activePaneId) ?? nextPanes[0]
    setActivePaneId(fallbackActivePane.id)
    closeTab(filename)
    if (fallbackActivePane.activeTab) openView(fallbackActivePane.activeTab)
    if (!nextPanes.some((pane) => pane.tabs.includes(filename))) canvas.discard(filename)
  }

  function handleReorderPaneTab(paneId: string, draggedFilename: string, targetFilename: string) {
    setActivePaneId(paneId)
    setViewPanes((panes) => reorderPaneTab(panes, paneId, draggedFilename, targetFilename))
  }

  function handleGraphReady(graph: A2UIGraph) {
    if (!activeTab || !currentProject || !activeTab.toLowerCase().endsWith('.a2ui.json')) return
    const document = legacyGraphToViewDocument(graph, displayViewName(activeTab))
    writeViewText(currentProject, activeTab, JSON.stringify(document, null, 2)).catch((err) =>
      console.error('writeViewText failed:', err),
    )
  }

  function handleNewTerminal(profile: TerminalProfile) {
    setTerminalSessions((sessions) => {
      const next = createTerminalSession(sessions, newTerminalSessionId(), profile)
      setActiveTerminalSessionId(next.id)
      return [...sessions, next]
    })
    setTerminalProfileMenuOpen(false)
  }

  function handleCloseTerminal(sessionId: string) {
    setTerminalSessions((sessions) => {
      const next = closeTerminalSession(sessions, activeTerminalSessionId, sessionId)
      if (next.sessions.length > 0) {
        setActiveTerminalSessionId(next.activeSessionId)
        return next.sessions
      }
      const replacement = createTerminalSession([], newTerminalSessionId(), terminalProfiles[0] ?? DEFAULT_TERMINAL_PROFILE)
      setActiveTerminalSessionId(replacement.id)
      return [replacement]
    })
  }

  function startRenameTerminal(session: TerminalSession) {
    setActiveTerminalSessionId(session.id)
    setRenamingTerminalSession({ id: session.id, value: session.title })
  }

  function commitRenameTerminal(sessionId: string, value: string) {
    setTerminalSessions((sessions) => renameTerminalSession(sessions, sessionId, value))
    setRenamingTerminalSession(null)
  }

  function handleTerminalRenameKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    session: TerminalSession,
  ) {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      setRenamingTerminalSession(null)
      event.currentTarget.value = session.title
      event.currentTarget.blur()
    }
  }

  async function handleRestartToUpdate() {
    if (updateState.phase !== 'ready') return
    setUpdateState((current) => ({
      ...current,
      phase: 'installing',
      message: 'Installing update...',
    }))
    try {
      await installUpdateAndRelaunch(downloadedUpdateRef.current)
    } catch (err) {
      setUpdateState({
        phase: 'error',
        message: `Install failed: ${String(err)}`,
      })
    }
  }

  async function handleOpenInspector() {
    setAppContextMenu(null)
    try {
      await openInspector()
    } catch (err) {
      window.alert(`Failed to open Inspector: ${String(err)}`)
    }
  }

  function renderAppContextMenu() {
    if (!appContextMenu) return null
    return (
      <div
        className="context-menu app-context-menu"
        style={{ left: appContextMenu.x, top: appContextMenu.y }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={() => {
            setAppContextMenu(null)
            reloadApp()
          }}
        >
          Reload
        </button>
        <button onClick={handleOpenInspector}>Inspect</button>
      </div>
    )
  }

  function beginSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth
    document.body.classList.add('is-resizing', 'is-resizing-columns')

    const handleMove = (moveEvent: PointerEvent) => {
      const next = clamp(startWidth + moveEvent.clientX - startX, 280, 560)
      setSidebarWidth(next)
      writeStoredNumber(SIDEBAR_WIDTH_KEY, next)
    }

    const stop = () => {
      document.body.classList.remove('is-resizing', 'is-resizing-columns')
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  function beginTerminalResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = terminalHeight
    document.body.classList.add('is-resizing', 'is-resizing-rows')

    const handleMove = (moveEvent: PointerEvent) => {
      const maxHeight = Math.max(180, window.innerHeight - 180)
      const next = clamp(startHeight - (moveEvent.clientY - startY), 150, maxHeight)
      setTerminalHeight(next)
      writeStoredNumber(TERMINAL_HEIGHT_KEY, next)
    }

    const stop = () => {
      document.body.classList.remove('is-resizing', 'is-resizing-rows')
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  function beginTerminalSessionResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = terminalSessionWidth
    document.body.classList.add('is-resizing', 'is-resizing-columns')

    const handleMove = (moveEvent: PointerEvent) => {
      const next = clamp(startWidth - (moveEvent.clientX - startX), 140, 320)
      setTerminalSessionWidth(next)
      writeStoredNumber(TERMINAL_SESSION_WIDTH_KEY, next)
    }

    const stop = () => {
      document.body.classList.remove('is-resizing', 'is-resizing-columns')
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  if (!currentProject) {
    return (
      <>
        {settingsOpen && (
          <SettingsDialog
            appInfo={appInfo}
            updateState={updateState}
            lensKits={lensKits}
            onClose={() => setSettingsOpen(false)}
            onRestartToUpdate={handleRestartToUpdate}
            onOpenInspector={handleOpenInspector}
          />
        )}
        {projectGuide && (
          <ProjectGuideDialog
            state={projectGuide}
            onNameChange={(name) => setProjectGuide({ ...projectGuide, name, error: null })}
            onChooseFolder={chooseProjectGuideFolder}
            onClose={() => setProjectGuide(null)}
            onCreate={handleInitializeGuidedProject}
            onInitialize={handleInitializeGuidedProject}
            onOpenExisting={handleOpenGuidedProject}
          />
        )}
        <EmptyState
          onNewProject={handleNewProject}
          onOpenProject={handleOpenProject}
          onOpenSample={handleOpenSample}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        {renderAppContextMenu()}
      </>
    )
  }

  return (
    <div className="app">
      {settingsOpen && (
        <SettingsDialog
          appInfo={appInfo}
          updateState={updateState}
          lensKits={lensKits}
          onClose={() => setSettingsOpen(false)}
          onRestartToUpdate={handleRestartToUpdate}
          onOpenInspector={handleOpenInspector}
        />
      )}
      {projectGuide && (
        <ProjectGuideDialog
          state={projectGuide}
          onNameChange={(name) => setProjectGuide({ ...projectGuide, name, error: null })}
          onChooseFolder={chooseProjectGuideFolder}
          onClose={() => setProjectGuide(null)}
          onCreate={handleInitializeGuidedProject}
          onInitialize={handleInitializeGuidedProject}
          onOpenExisting={handleOpenGuidedProject}
        />
      )}
      <div
        className="app-body"
        style={{ gridTemplateColumns: `${sidebarWidth}px 5px minmax(0, 1fr)` }}
      >
        <Sidebar
          projectName={projectName}
          views={viewList}
          folders={folderList}
          activeView={activeTab}
          selectedFolder={selectedFolder}
          onSelect={handleOpenView}
          onSelectFolder={setSelectedFolder}
          onNewProject={handleNewProject}
          onOpenProject={handleOpenProject}
          onNewFolder={handleNewFolder}
          onDeleteFolder={handleDeleteFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteView={handleDeleteView}
          onRenameView={handleRenameView}
          onMoveView={handleMoveView}
          onNewCanvas={handleNewCanvas}
          onOpenSettings={() => setSettingsOpen(true)}
          updateReady={updateState.phase === 'ready'}
        />
        <div
          className="resize-handle vertical-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={beginSidebarResize}
        />
        <main
          className="viewer"
          style={{ gridTemplateRows: `minmax(0, 1fr) 5px ${terminalHeight}px` }}
        >
          <section className="view-block">
            <div
              className="view-pane-grid"
              style={{ gridTemplateColumns: `repeat(${viewPanes.length}, minmax(260px, 1fr))` }}
            >
              {viewPanes.map((pane) => (
                <section
                  key={pane.id}
                  className={`view-pane-shell ${pane.id === activePaneId ? 'active' : ''}`}
                  data-view-pane-id={pane.id}
                  onPointerDown={() => {
                    setActivePaneId(pane.id)
                    if (pane.activeTab) openView(pane.activeTab)
                  }}
                >
                  <TabStrip
                    paneId={pane.id}
                    tabs={pane.tabs}
                    activeTab={pane.activeTab}
                    onActivate={(filename) => handleActivatePaneTab(pane.id, filename)}
                    onClose={(filename) => handleClosePaneTab(pane.id, filename)}
                    onReorder={(draggedFilename, targetFilename) =>
                      handleReorderPaneTab(pane.id, draggedFilename, targetFilename)}
                  />
                  <div className="viewer-body">
                      <ViewPaneContent
                        projectPath={currentProject}
                        filename={pane.activeTab}
                        reloadKey={viewReloadKey}
                      />
                  </div>
                </section>
              ))}
            </div>
          </section>
          <div
            className="resize-handle horizontal-resizer"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize terminal"
            onPointerDown={beginTerminalResize}
          />
          <section className="terminal-block">
            <div className="panel-header">
              <span>Terminal</span>
              <div className="terminal-new-menu">
                <button
                  className="terminal-new-button"
                  onClick={() => setTerminalProfileMenuOpen((open) => !open)}
                  aria-label="New Terminal"
                >
                  +
                </button>
                {terminalProfileMenuOpen && (
                  <div className="terminal-profile-menu">
                    {terminalProfiles.map((profile) => (
                      <button
                        key={profile.id}
                        onClick={() => handleNewTerminal(profile)}
                      >
                        {profile.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div
              className="terminal-layout"
              style={{ gridTemplateColumns: `minmax(0, 1fr) 5px ${terminalSessionWidth}px` }}
            >
              <div className="terminal-stack">
                {terminalSessions.map((session) => (
                  <div
                    key={session.id}
                    className={`terminal-session-pane ${session.id === activeTerminalSessionId ? 'active' : ''}`}
                  >
                    <TerminalPanel
                      projectPath={currentProject}
                      profile={session.profileId}
                      activeView={activeTab}
                      paneKey={`${currentProject}:${session.id}`}
                      onGraphReady={handleGraphReady}
                    />
                  </div>
                ))}
              </div>
              <div
                className="resize-handle terminal-session-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize terminal sessions"
                onPointerDown={beginTerminalSessionResize}
              />
              <aside className="terminal-session-list" aria-label="Terminal sessions">
                <div className="session-list-header">Sessions</div>
                {terminalSessions.map((session) => (
                  <div
                    key={session.id}
                    className={`terminal-session ${session.id === activeTerminalSessionId ? 'active' : ''}`}
                    onClick={() => setActiveTerminalSessionId(session.id)}
                  >
                    <span className="session-dot" />
                    {renamingTerminalSession?.id === session.id ? (
                      <input
                        className="terminal-session-title-input"
                        defaultValue={renamingTerminalSession.value}
                        autoFocus
                        onClick={(event) => event.stopPropagation()}
                        onFocus={(event) => event.currentTarget.select()}
                        onKeyDown={(event) => handleTerminalRenameKeyDown(event, session)}
                        onBlur={(event) => commitRenameTerminal(session.id, event.currentTarget.value)}
                      />
                    ) : (
                      <span
                        className="terminal-session-title"
                        onClick={(event) => {
                          event.stopPropagation()
                          startRenameTerminal(session)
                        }}
                      >
                        {session.title}
                      </span>
                    )}
                    <button
                      className="terminal-session-close"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleCloseTerminal(session.id)
                      }}
                      aria-label={`Close ${session.title}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </aside>
            </div>
          </section>
        </main>
      </div>
      {renderAppContextMenu()}
    </div>
  )
}
