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
