import { open } from '@tauri-apps/plugin-dialog'
import { readDir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { basename, join } from '@tauri-apps/api/path'
import type { A2UIGraph } from '../a2ui/schema'

const VIEW_EXTENSIONS = ['.html', '.a2ui.json'] as const

/** Opens a folder picker. Returns absolute path or null if cancelled. */
export async function pickFolder(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false })
  if (typeof result === 'string') return result
  return null
}

/** Lists view files (.html and .a2ui.json) in `projectPath`, sorted ascending. */
export async function listProjectViews(projectPath: string): Promise<string[]> {
  const entries = await readDir(projectPath)
  const lower = (s: string) => s.toLowerCase()
  return entries
    .filter((e) => e.isFile && VIEW_EXTENSIONS.some((ext) => lower(e.name).endsWith(ext)))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))
}

/** Backwards-compatible alias for callers still expecting the .html-only filter. */
export const listHtmlFiles = listProjectViews

/** Reads a view file's text contents. */
export async function readViewFile(projectPath: string, filename: string): Promise<string> {
  const full = await join(projectPath, filename)
  return readTextFile(full)
}

/** Writes an A2UI graph to `<projectPath>/<filename>` as pretty JSON. */
export async function writeViewGraph(projectPath: string, filename: string, graph: A2UIGraph): Promise<void> {
  const full = await join(projectPath, filename)
  await writeTextFile(full, JSON.stringify(graph, null, 2))
}

/** Returns the basename of a path (last segment). */
export async function pathBasename(path: string): Promise<string> {
  return basename(path)
}
