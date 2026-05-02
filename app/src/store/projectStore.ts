import { create } from 'zustand'

export interface ProjectState {
  currentProject: string | null   // absolute path
  viewList: string[]              // .html filenames in project root, sorted
  openTabs: string[]              // filenames currently open as tabs
  activeTab: string | null        // currently focused tab filename
  reset: () => void
  openProject: (path: string, htmlFiles: string[]) => void
  openView: (filename: string) => void
  closeTab: (filename: string) => void
  refreshViewList: (htmlFiles: string[]) => void
}

const initialState = {
  currentProject: null,
  viewList: [],
  openTabs: [],
  activeTab: null,
} satisfies Omit<ProjectState, 'reset' | 'openProject' | 'openView' | 'closeTab' | 'refreshViewList'>

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
  refreshViewList: (htmlFiles) =>
    set({ viewList: [...htmlFiles].sort((a, b) => a.localeCompare(b)) }),
}))
