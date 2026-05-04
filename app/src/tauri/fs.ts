import { open } from '@tauri-apps/plugin-dialog'
import { exists, mkdir, readDir, readTextFile, remove, rename, writeTextFile } from '@tauri-apps/plugin-fs'
import { basename, join } from '@tauri-apps/api/path'
import type { A2UIGraph } from '../a2ui/schema'

const VIEW_EXTENSIONS = ['.html', '.a2ui.json'] as const
const PROJECT_DIR = '.delineation'
const PROJECT_VIEWS_DIR = `${PROJECT_DIR}/views`
const PROJECT_FILE = `${PROJECT_DIR}/project.json`

export interface ProjectMetadata {
  name: string
  version: number
  createdAt?: string
}

/** Opens a folder picker. Returns absolute path or null if cancelled. */
export async function pickFolder(title = 'Open Project Folder'): Promise<string | null> {
  const result = await open({ title, directory: true, multiple: false, canCreateDirectories: true })
  if (typeof result === 'string') return result
  return null
}

/** Creates an absolute project folder under the selected parent directory. */
export async function createProjectDirectory(parentPath: string, projectName: string): Promise<string> {
  const cleanName = projectName.trim().replace(/[\\/]/g, '-')
  if (!cleanName) throw new Error('Project name is required.')
  const full = await join(parentPath, cleanName)
  if (await exists(full)) throw new Error(`Project folder already exists: ${cleanName}`)
  await mkdir(full)
  await initializeProjectDirectory(full, cleanName)
  return full
}

export async function isProjectDirectory(projectPath: string): Promise<boolean> {
  return exists(await join(projectPath, PROJECT_FILE))
}

export async function initializeProjectDirectory(projectPath: string, projectName?: string): Promise<void> {
  await mkdir(await join(projectPath, PROJECT_DIR), { recursive: true })
  await mkdir(await join(projectPath, PROJECT_VIEWS_DIR), { recursive: true })
  const name = projectName?.trim() || await basename(projectPath)
  await writeTextFile(await join(projectPath, PROJECT_FILE), JSON.stringify({
    name,
    version: 1,
    createdAt: new Date().toISOString(),
  }, null, 2))
}

export async function readProjectMetadata(projectPath: string): Promise<ProjectMetadata> {
  const text = await readTextFile(await join(projectPath, PROJECT_FILE))
  const parsed = JSON.parse(text) as Partial<ProjectMetadata>
  const name = parsed.name?.trim() || await basename(projectPath)
  return {
    name,
    version: Number.isFinite(parsed.version) ? Number(parsed.version) : 1,
    createdAt: parsed.createdAt,
  }
}

async function ensureViewsDirectory(projectPath: string): Promise<string> {
  const viewsPath = await join(projectPath, PROJECT_VIEWS_DIR)
  if (!await exists(viewsPath)) {
    await mkdir(viewsPath, { recursive: true })
  }
  return viewsPath
}

function shouldSkipEntry(name: string): boolean {
  return name === PROJECT_DIR || name.startsWith('.')
}

function isViewFile(name: string): boolean {
  const lower = name.toLowerCase()
  return VIEW_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

async function listViewsRecursive(viewsPath: string, relativeDir = ''): Promise<string[]> {
  const dir = relativeDir ? await join(viewsPath, relativeDir) : viewsPath
  const entries = await readDir(dir)
  const paths: string[] = []

  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) continue
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
    if (entry.isDirectory) {
      paths.push(...await listViewsRecursive(viewsPath, relativePath))
    } else if (entry.isFile && isViewFile(entry.name)) {
      paths.push(relativePath)
    }
  }

  return paths
}

async function listFoldersRecursive(viewsPath: string, relativeDir = ''): Promise<string[]> {
  const dir = relativeDir ? await join(viewsPath, relativeDir) : viewsPath
  const entries = await readDir(dir)
  const paths: string[] = []

  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) continue
    if (!entry.isDirectory) continue
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
    paths.push(relativePath)
    paths.push(...await listFoldersRecursive(viewsPath, relativePath))
  }

  return paths
}

/** Lists view files (.html and .a2ui.json) in `projectPath`, recursively sorted ascending. */
export async function listProjectViews(projectPath: string): Promise<string[]> {
  const paths = await listViewsRecursive(await ensureViewsDirectory(projectPath))
  return paths.sort((a, b) => a.localeCompare(b))
}

/** Lists project-relative folders recursively, including empty folders. */
export async function listProjectFolders(projectPath: string): Promise<string[]> {
  const paths = await listFoldersRecursive(await ensureViewsDirectory(projectPath))
  return paths.sort((a, b) => a.localeCompare(b))
}

/** Backwards-compatible alias for callers still expecting the .html-only filter. */
export const listHtmlFiles = listProjectViews

/** Reads a view file's text contents. */
export async function readViewFile(projectPath: string, filename: string): Promise<string> {
  const full = await join(await ensureViewsDirectory(projectPath), filename)
  return readTextFile(full)
}

/** Writes an A2UI graph to `<projectPath>/<filename>` as pretty JSON. */
export async function writeViewGraph(projectPath: string, filename: string, graph: A2UIGraph): Promise<void> {
  const full = await join(await ensureViewsDirectory(projectPath), filename)
  await writeTextFile(full, JSON.stringify(graph, null, 2))
}

/** Writes raw text to a project-relative file. Parent folders must already exist. */
export async function writeViewText(projectPath: string, filename: string, content: string): Promise<void> {
  const full = await join(await ensureViewsDirectory(projectPath), filename)
  await writeTextFile(full, content)
}

/** Creates a project-relative folder. */
export async function createProjectFolder(projectPath: string, folderPath: string): Promise<void> {
  const trimmed = folderPath.replace(/^\/+|\/+$/g, '')
  if (!trimmed) return
  const full = await join(await ensureViewsDirectory(projectPath), trimmed)
  await mkdir(full, { recursive: true })
}

/** Deletes a project-relative folder and everything under it. */
export async function deleteProjectFolder(projectPath: string, folderPath: string): Promise<void> {
  const trimmed = folderPath.replace(/^\/+|\/+$/g, '')
  if (!trimmed) return
  const full = await join(await ensureViewsDirectory(projectPath), trimmed)
  await remove(full, { recursive: true })
}

/** Renames or moves a project-relative folder. */
export async function renameProjectFolder(projectPath: string, oldFolderPath: string, newFolderPath: string): Promise<void> {
  const oldTrimmed = oldFolderPath.replace(/^\/+|\/+$/g, '')
  const newTrimmed = newFolderPath.replace(/^\/+|\/+$/g, '')
  if (!oldTrimmed || !newTrimmed) return
  const viewsPath = await ensureViewsDirectory(projectPath)
  const parent = newTrimmed.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
  if (parent) {
    await mkdir(await join(viewsPath, parent), { recursive: true })
  }
  await rename(await join(viewsPath, oldTrimmed), await join(viewsPath, newTrimmed))
}

/** Deletes a project-relative View file. */
export async function deleteProjectView(projectPath: string, filename: string): Promise<void> {
  const full = await join(await ensureViewsDirectory(projectPath), filename)
  await remove(full)
}

/** Renames or moves a project-relative View file. */
export async function renameProjectView(projectPath: string, oldFilename: string, newFilename: string): Promise<void> {
  const viewsPath = await ensureViewsDirectory(projectPath)
  const oldFull = await join(viewsPath, oldFilename)
  const parent = newFilename.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
  if (parent) {
    await mkdir(await join(viewsPath, parent), { recursive: true })
  }
  const newFull = await join(viewsPath, newFilename)
  await rename(oldFull, newFull)
}

/** Returns the basename of a path (last segment). */
export async function pathBasename(path: string): Promise<string> {
  return basename(path)
}
