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
