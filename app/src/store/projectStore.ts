import { create } from 'zustand'

export interface ProjectState {
  currentProject: string | null   // absolute path
  viewList: string[]              // View filenames in project root, sorted
  openTabs: string[]              // filenames currently open as tabs
  activeTab: string | null        // currently focused tab filename
  reset: () => void
  openProject: (path: string, htmlFiles: string[]) => void
  openView: (filename: string) => void
  closeTab: (filename: string) => void
  reorderTabs: (draggedFilename: string, targetFilename: string) => void
  refreshViewList: (htmlFiles: string[]) => void
  renameView: (oldFilename: string, newFilename: string) => void
  renameFolder: (oldFolderPath: string, newFolderPath: string) => void
  deleteFolder: (folderPath: string) => void
}

const initialState = {
  currentProject: null,
  viewList: [],
  openTabs: [],
  activeTab: null,
} satisfies Omit<ProjectState, 'reset' | 'openProject' | 'openView' | 'closeTab' | 'reorderTabs' | 'refreshViewList' | 'renameView' | 'renameFolder' | 'deleteFolder'>

function normalizeFolder(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function isUnderFolder(filename: string, folderPath: string): boolean {
  const folder = normalizeFolder(folderPath)
  return filename === folder || filename.startsWith(`${folder}/`)
}

function replaceFolderPrefix(filename: string, oldFolderPath: string, newFolderPath: string): string {
  const oldFolder = normalizeFolder(oldFolderPath)
  const newFolder = normalizeFolder(newFolderPath)
  if (!isUnderFolder(filename, oldFolder)) return filename
  const suffix = filename.slice(oldFolder.length).replace(/^\/+/, '')
  return newFolder ? `${newFolder}/${suffix}` : suffix
}

export const useProjectStore = create<ProjectState>((set) => ({
  ...initialState,
  reset: () => set(initialState),
  openProject: (path, htmlFiles) =>
    set({
      currentProject: path,
      viewList: [...htmlFiles].sort((a, b) => a.localeCompare(b)),
      openTabs: [],
      activeTab: null,
    }),
  openView: (filename) =>
    set((state) => {
      const alreadyOpen = state.openTabs.includes(filename)
      return {
        openTabs: alreadyOpen ? state.openTabs : [...state.openTabs, filename],
        activeTab: filename,
      }
    }),
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
  reorderTabs: (draggedFilename, targetFilename) =>
    set((state) => {
      if (draggedFilename === targetFilename) return state
      const from = state.openTabs.indexOf(draggedFilename)
      const to = state.openTabs.indexOf(targetFilename)
      if (from === -1 || to === -1) return state
      const nextTabs = [...state.openTabs]
      const [dragged] = nextTabs.splice(from, 1)
      nextTabs.splice(to, 0, dragged)
      return { openTabs: nextTabs }
    }),
  refreshViewList: (htmlFiles) =>
    set({ viewList: [...htmlFiles].sort((a, b) => a.localeCompare(b)) }),
  renameView: (oldFilename, newFilename) =>
    set((state) => ({
      viewList: state.viewList
        .map((filename) => filename === oldFilename ? newFilename : filename)
        .sort((a, b) => a.localeCompare(b)),
      openTabs: state.openTabs.map((filename) => filename === oldFilename ? newFilename : filename),
      activeTab: state.activeTab === oldFilename ? newFilename : state.activeTab,
    })),
  renameFolder: (oldFolderPath, newFolderPath) =>
    set((state) => ({
      viewList: state.viewList
        .map((filename) => replaceFolderPrefix(filename, oldFolderPath, newFolderPath))
        .sort((a, b) => a.localeCompare(b)),
      openTabs: state.openTabs.map((filename) =>
        replaceFolderPrefix(filename, oldFolderPath, newFolderPath),
      ),
      activeTab: state.activeTab
        ? replaceFolderPrefix(state.activeTab, oldFolderPath, newFolderPath)
        : null,
    })),
  deleteFolder: (folderPath) =>
    set((state) => {
      const openTabs = state.openTabs.filter((filename) => !isUnderFolder(filename, folderPath))
      const activeTab = state.activeTab && !isUnderFolder(state.activeTab, folderPath)
        ? state.activeTab
        : openTabs[openTabs.length - 1] ?? null
      return {
        viewList: state.viewList.filter((filename) => !isUnderFolder(filename, folderPath)),
        openTabs,
        activeTab,
      }
    }),
}))
