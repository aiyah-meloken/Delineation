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
