import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { A2UIGraph } from '../a2ui/schema'
import type { TerminalProfile, TerminalProfileId } from '../terminal/sessionModel'

export async function spawnTerminal(
  projectPath: string,
  profile: TerminalProfileId,
  cols: number,
  rows: number,
): Promise<string> {
  return invoke('term_spawn', { projectPath, profile, cols, rows })
}

export async function listTerminalProfiles(): Promise<TerminalProfile[]> {
  return invoke('term_available_profiles')
}

export async function writeTerminal(sessionId: string, base64Data: string): Promise<void> {
  return invoke('term_write', { sessionId, data: base64Data })
}

export async function resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void> {
  return invoke('term_resize', { sessionId, cols, rows })
}

export async function killTerminal(sessionId: string): Promise<void> {
  return invoke('term_kill', { sessionId })
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
