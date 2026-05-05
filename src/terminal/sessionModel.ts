export type TerminalProfileId = 'shell' | 'claude' | 'codex'

export interface TerminalProfile {
  id: TerminalProfileId
  label: string
}

export interface TerminalSession {
  id: string
  profileId: TerminalProfileId
  title: string
}

export function newTerminalSessionId(): string {
  return `terminal-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function createTerminalSession(
  _existing: TerminalSession[],
  id: string,
  profile: TerminalProfile,
): TerminalSession {
  return {
    id,
    profileId: profile.id,
    title: profile.label,
  }
}

export function terminalWorkspaceStorageKey(projectPath: string): string {
  return `delineation.terminalSessions.${encodeURIComponent(projectPath)}`
}

export function restoreTerminalSessions(
  raw: string | null,
  fallbackProfile: TerminalProfile,
): { sessions: TerminalSession[]; activeSessionId: string | null } {
  if (!raw) {
    const session = createTerminalSession([], newTerminalSessionId(), fallbackProfile)
    return { sessions: [session], activeSessionId: session.id }
  }
  try {
    const parsed = JSON.parse(raw) as {
      sessions?: TerminalSession[]
      activeSessionId?: string | null
    }
    const sessions = Array.isArray(parsed.sessions)
      ? parsed.sessions.filter((session) =>
          typeof session.id === 'string' &&
          ['shell', 'claude', 'codex'].includes(session.profileId) &&
          typeof session.title === 'string',
        )
      : []
    if (sessions.length === 0) {
      const session = createTerminalSession([], newTerminalSessionId(), fallbackProfile)
      return { sessions: [session], activeSessionId: session.id }
    }
    const activeSessionId = sessions.some((session) => session.id === parsed.activeSessionId)
      ? parsed.activeSessionId ?? sessions[0].id
      : sessions[0].id
    return { sessions, activeSessionId }
  } catch {
    const session = createTerminalSession([], newTerminalSessionId(), fallbackProfile)
    return { sessions: [session], activeSessionId: session.id }
  }
}

export function serializeTerminalSessions(
  sessions: TerminalSession[],
  activeSessionId: string | null,
): string {
  return JSON.stringify({ sessions, activeSessionId })
}

export function renameTerminalSession(
  sessions: TerminalSession[],
  sessionId: string,
  rawTitle: string,
): TerminalSession[] {
  const title = rawTitle.trim()
  if (!title) return sessions
  return sessions.map((session) =>
    session.id === sessionId ? { ...session, title } : session,
  )
}

export function closeTerminalSession(
  sessions: TerminalSession[],
  activeSessionId: string | null,
  closingSessionId: string,
): { sessions: TerminalSession[]; activeSessionId: string | null } {
  const idx = sessions.findIndex((session) => session.id === closingSessionId)
  if (idx === -1) return { sessions, activeSessionId }

  const nextSessions = sessions.filter((session) => session.id !== closingSessionId)
  if (activeSessionId !== closingSessionId) {
    return { sessions: nextSessions, activeSessionId }
  }

  return {
    sessions: nextSessions,
    activeSessionId: nextSessions[idx]?.id ?? nextSessions[idx - 1]?.id ?? null,
  }
}
