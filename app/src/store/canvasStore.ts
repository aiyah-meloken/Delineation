import { create } from 'zustand'
import type { A2UIGraph } from '../a2ui/schema'

interface State {
  graphs: Record<string, A2UIGraph>
  getGraph: (filename: string) => A2UIGraph | null
  setGraph: (filename: string, graph: A2UIGraph) => void
  discard: (filename: string) => void
  rename: (oldFilename: string, newFilename: string) => void
  renamePrefix: (oldFolderPath: string, newFolderPath: string) => void
  discardPrefix: (folderPath: string) => void
  reset: () => void
}

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
  rename: (oldFilename, newFilename) =>
    set((s) => {
      const graph = s.graphs[oldFilename]
      if (!graph) return s
      const next = { ...s.graphs, [newFilename]: graph }
      delete next[oldFilename]
      return { graphs: next }
    }),
  renamePrefix: (oldFolderPath, newFolderPath) =>
    set((s) => {
      const next: Record<string, A2UIGraph> = {}
      for (const [filename, graph] of Object.entries(s.graphs)) {
        next[replaceFolderPrefix(filename, oldFolderPath, newFolderPath)] = graph
      }
      return { graphs: next }
    }),
  discardPrefix: (folderPath) =>
    set((s) => {
      const next: Record<string, A2UIGraph> = {}
      for (const [filename, graph] of Object.entries(s.graphs)) {
        if (!isUnderFolder(filename, folderPath)) next[filename] = graph
      }
      return { graphs: next }
    }),
  reset: () => set({ graphs: {} }),
}))
