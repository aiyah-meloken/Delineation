import { describe, expect, it } from 'vitest'
import {
  closeTerminalSession,
  createTerminalSession,
  renameTerminalSession,
  type TerminalProfile,
  type TerminalSession,
} from './sessionModel'

const shell: TerminalProfile = { id: 'shell', label: 'zsh' }
const claude: TerminalProfile = { id: 'claude', label: 'Claude Code' }

describe('createTerminalSession', () => {
  it('uses the selected profile label as the default session title', () => {
    const first = createTerminalSession([], 'a', shell)
    const second = createTerminalSession([first], 'b', claude)
    const third = createTerminalSession([first, second], 'c', claude)

    expect(first).toEqual({ id: 'a', profileId: 'shell', title: 'zsh' })
    expect(second).toEqual({ id: 'b', profileId: 'claude', title: 'Claude Code' })
    expect(third).toEqual({ id: 'c', profileId: 'claude', title: 'Claude Code' })
  })
})

describe('renameTerminalSession', () => {
  const sessions: TerminalSession[] = [
    { id: 'a', profileId: 'shell', title: 'zsh' },
    { id: 'b', profileId: 'claude', title: 'Claude Code' },
  ]

  it('renames a matching session with trimmed text', () => {
    expect(renameTerminalSession(sessions, 'b', '  subscription check  ')).toEqual([
      { id: 'a', profileId: 'shell', title: 'zsh' },
      { id: 'b', profileId: 'claude', title: 'subscription check' },
    ])
  })

  it('keeps the old title when the new title is empty', () => {
    expect(renameTerminalSession(sessions, 'b', '   ')[1].title).toBe('Claude Code')
  })
})

describe('closeTerminalSession', () => {
  const sessions: TerminalSession[] = [
    { id: 'a', profileId: 'claude', title: 'Claude Code' },
    { id: 'b', profileId: 'claude', title: 'Review flow' },
    { id: 'c', profileId: 'claude', title: 'Watch diff' },
  ]

  it('keeps active session when closing a non-active session', () => {
    expect(closeTerminalSession(sessions, 'c', 'a')).toEqual({
      sessions: [
        { id: 'b', profileId: 'claude', title: 'Review flow' },
        { id: 'c', profileId: 'claude', title: 'Watch diff' },
      ],
      activeSessionId: 'c',
    })
  })

  it('activates right neighbor when closing active session', () => {
    expect(closeTerminalSession(sessions, 'a', 'a').activeSessionId).toBe('b')
  })

  it('falls back to left neighbor when closing rightmost active session', () => {
    expect(closeTerminalSession(sessions, 'c', 'c').activeSessionId).toBe('b')
  })
})
