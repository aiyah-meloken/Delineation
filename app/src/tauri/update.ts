import type { Update } from '@tauri-apps/plugin-updater'

export type UpdatePhase =
  | 'checking'
  | 'up-to-date'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'unavailable'
  | 'error'

export interface AppInfo {
  name: string
  version: string
}

export interface UpdateState {
  phase: UpdatePhase
  message: string
  currentVersion?: string
  nextVersion?: string
  downloadedBytes?: number
  totalBytes?: number
}

export const initialUpdateState: UpdateState = {
  phase: 'checking',
  message: 'Checking for updates...',
}

export function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window
}

export async function readAppInfo(): Promise<AppInfo> {
  try {
    const { getName, getVersion } = await import('@tauri-apps/api/app')
    const [name, version] = await Promise.all([getName(), getVersion()])
    return { name, version }
  } catch {
    return { name: 'Delineation', version: '0.1.0' }
  }
}

export async function checkAndDownloadUpdate(
  onState: (state: UpdateState) => void,
): Promise<Update | null> {
  if (!isTauriRuntime()) {
    onState({
      phase: 'unavailable',
      message: 'Updates are available in the desktop app.',
    })
    return null
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    onState({
      phase: 'checking',
      message: 'Checking for updates...',
    })

    const update = await check()
    if (!update) {
      onState({
        phase: 'up-to-date',
        message: 'Delineation is up to date.',
      })
      return null
    }

    let downloadedBytes = 0
    let totalBytes: number | undefined
    onState({
      phase: 'downloading',
      message: `Downloading ${update.version}...`,
      currentVersion: update.currentVersion,
      nextVersion: update.version,
    })

    await update.download((event) => {
      if (event.event === 'Started') {
        totalBytes = event.data.contentLength
        downloadedBytes = 0
      } else if (event.event === 'Progress') {
        downloadedBytes += event.data.chunkLength
      }

      if (event.event !== 'Finished') {
        onState({
          phase: 'downloading',
          message: `Downloading ${update.version}...`,
          currentVersion: update.currentVersion,
          nextVersion: update.version,
          downloadedBytes,
          totalBytes,
        })
      }
    })

    onState({
      phase: 'ready',
      message: `Version ${update.version} is ready to install.`,
      currentVersion: update.currentVersion,
      nextVersion: update.version,
      downloadedBytes,
      totalBytes,
    })
    return update
  } catch (err) {
    onState({
      phase: 'error',
      message: `Update check failed: ${String(err)}`,
    })
    return null
  }
}

export async function installUpdateAndRelaunch(update: Update | null): Promise<void> {
  if (!update) return
  await update.install()
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}
