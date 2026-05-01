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
