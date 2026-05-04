import { invoke } from '@tauri-apps/api/core'

export async function openInspector(): Promise<void> {
  await invoke('open_inspector')
}

export function reloadApp(): void {
  window.location.reload()
}
