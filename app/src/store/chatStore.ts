import { create } from 'zustand'

export type ChatRole = 'user' | 'assistant'
export interface ChatMessage {
  role: ChatRole
  text: string
}

export interface ChatSession {
  messages: ChatMessage[]
  isStreaming: boolean
  parseError: string | null
}

interface State {
  sessions: Record<string, ChatSession>
  appendUserMessage: (filename: string, text: string) => void
  appendAssistantChunk: (filename: string, delta: string) => void
  endTurn: (filename: string, result: { success: boolean; parseError?: string }) => void
  discardSession: (filename: string) => void
  reset: () => void
}

const blankSession = (): ChatSession => ({ messages: [], isStreaming: false, parseError: null })

export const useChatStore = create<State>((set) => ({
  sessions: {},

  appendUserMessage: (filename, text) =>
    set((state) => {
      const prev = state.sessions[filename] ?? blankSession()
      return {
        sessions: {
          ...state.sessions,
          [filename]: {
            messages: [...prev.messages, { role: 'user', text }],
            isStreaming: true,
            parseError: prev.parseError,
          },
        },
      }
    }),

  appendAssistantChunk: (filename, delta) =>
    set((state) => {
      const prev = state.sessions[filename] ?? blankSession()
      const last = prev.messages[prev.messages.length - 1]
      const messages =
        last && last.role === 'assistant'
          ? [...prev.messages.slice(0, -1), { role: 'assistant' as const, text: last.text + delta }]
          : [...prev.messages, { role: 'assistant' as const, text: delta }]
      return { sessions: { ...state.sessions, [filename]: { ...prev, messages } } }
    }),

  endTurn: (filename, result) =>
    set((state) => {
      const prev = state.sessions[filename] ?? blankSession()
      return {
        sessions: {
          ...state.sessions,
          [filename]: {
            ...prev,
            isStreaming: false,
            parseError: result.success ? null : (result.parseError ?? 'unknown error'),
          },
        },
      }
    }),

  discardSession: (filename) =>
    set((state) => {
      const next = { ...state.sessions }
      delete next[filename]
      return { sessions: next }
    }),

  reset: () => set({ sessions: {} }),
}))
