import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { A2UIGraph } from '../a2ui/schema'
import type { TerminalProfile, TerminalProfileId } from '../terminal/sessionModel'

export async function spawnTerminal(
  sessionId: string,
  projectPath: string,
  profile: TerminalProfileId,
  activeView: string | null,
  cols: number,
  rows: number,
): Promise<string> {
  return invoke('term_spawn', { sessionId, projectPath, profile, activeView, cols, rows })
}

export async function listTerminalProfiles(): Promise<TerminalProfile[]> {
  return invoke('term_available_profiles')
}

export async function writeTerminal(projectPath: string, sessionId: string, base64Data: string): Promise<void> {
  return invoke('term_write', { projectPath, sessionId, data: base64Data })
}

export async function resizeTerminal(projectPath: string, sessionId: string, cols: number, rows: number): Promise<void> {
  return invoke('term_resize', { projectPath, sessionId, cols, rows })
}

export async function killTerminal(projectPath: string, sessionId: string): Promise<void> {
  return invoke('term_kill', { projectPath, sessionId })
}

export async function detachTerminal(sessionId: string): Promise<void> {
  return invoke('term_detach', { sessionId })
}

export interface TermDataEvent { session_id: string; bytes_b64: string }
export interface TermExitEvent { session_id: string; code: number | null }
export interface GraphEvent { session_id: string; graph: A2UIGraph }
export interface ParseErrorEvent { session_id: string; msg: string }

export function onTermData(cb: (e: TermDataEvent) => void): Promise<UnlistenFn> {
  return listen<TermDataEvent>('term://data', (e) => cb(e.payload))
}
export function onTermExit(cb: (e: TermExitEvent) => void): Promise<UnlistenFn> {
  return listen<TermExitEvent>('term://exit', (e) => cb(e.payload))
}
export function onGraph(cb: (e: GraphEvent) => void): Promise<UnlistenFn> {
  return listen<GraphEvent>('a2ui://graph', (e) => cb(e.payload))
}
export function onParseError(cb: (e: ParseErrorEvent) => void): Promise<UnlistenFn> {
  return listen<ParseErrorEvent>('term://parse-error', (e) => cb(e.payload))
}
