import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface ControlInfo {
  socketPath: string
  storePath: string
}

export interface ViewVersionInfo {
  id: string
  createdAt: string
  path: string
}

export interface LensKitInfo {
  id: string
  name: string
  version: string
  description: string
  path: string
  hasOperator: boolean
  hasRenderer: boolean
  hasWatcher: boolean
  operatorFiles: string[]
  rendererFiles: string[]
  watcherFiles: string[]
}

export interface ControlViewChangedEvent {
  action: 'create' | 'update' | 'open'
  viewPath: string
}

export async function startControl(projectPath: string): Promise<ControlInfo> {
  return invoke('control_start', { projectPath })
}

export async function setControlContext(
  projectPath: string | null,
  activeView: string | null,
): Promise<void> {
  return invoke('control_set_context', { projectPath, activeView })
}

export async function listViewVersions(
  projectPath: string,
  viewPath: string,
): Promise<ViewVersionInfo[]> {
  return invoke('control_list_view_versions', { projectPath, viewPath })
}

export async function getViewVersion(
  projectPath: string,
  viewPath: string,
  versionId: string,
): Promise<string> {
  return invoke('control_get_view_version', { projectPath, viewPath, versionId })
}

export async function listLensKits(projectPath: string): Promise<LensKitInfo[]> {
  return invoke('control_list_lenskits', { projectPath })
}

export function onControlViewChanged(cb: (event: ControlViewChangedEvent) => void): Promise<UnlistenFn> {
  return listen<ControlViewChangedEvent>('control://view-changed', (event) => cb(event.payload))
}
