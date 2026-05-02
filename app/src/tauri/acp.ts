import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { A2UIGraph } from '../a2ui/schema'

export async function startAcpSession(projectPath: string): Promise<string> {
  return invoke('acp_start_session', { projectPath })
}

export async function sendAcpPrompt(sessionId: string, text: string): Promise<void> {
  return invoke('acp_send_prompt', { sessionId, text })
}

export async function cancelAcpSession(sessionId: string): Promise<void> {
  return invoke('acp_cancel', { sessionId })
}

export interface ChunkEvent { session_id: string; delta: string }
export interface TurnEndedEvent { session_id: string; success: boolean; parse_error?: string }
export interface GraphEvent { session_id: string; graph: A2UIGraph }

export function onChunk(cb: (e: ChunkEvent) => void): Promise<UnlistenFn> {
  return listen<ChunkEvent>('acp://chunk', (e) => cb(e.payload))
}

export function onTurnEnded(cb: (e: TurnEndedEvent) => void): Promise<UnlistenFn> {
  return listen<TurnEndedEvent>('acp://turn-ended', (e) => cb(e.payload))
}

export function onGraph(cb: (e: GraphEvent) => void): Promise<UnlistenFn> {
  return listen<GraphEvent>('a2ui://graph', (e) => cb(e.payload))
}
