import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from './chatStore'

describe('chatStore', () => {
  beforeEach(() => {
    useChatStore.getState().reset()
  })

  it('initial: no sessions', () => {
    expect(useChatStore.getState().sessions).toEqual({})
  })

  it('appendUserMessage starts a fresh session for unknown filename', () => {
    useChatStore.getState().appendUserMessage('Untitled.a2ui.json', 'analyze auth')
    const s = useChatStore.getState().sessions['Untitled.a2ui.json']
    expect(s.messages).toEqual([{ role: 'user', text: 'analyze auth' }])
    expect(s.isStreaming).toBe(true)
    expect(s.parseError).toBeNull()
  })

  it('appendAssistantChunk appends or extends the trailing assistant message', () => {
    const f = 'x.a2ui.json'
    const s = useChatStore.getState()
    s.appendUserMessage(f, 'hi')
    s.appendAssistantChunk(f, 'hel')
    s.appendAssistantChunk(f, 'lo')
    const msgs = useChatStore.getState().sessions[f].messages
    expect(msgs).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello' },
    ])
  })

  it('endTurn clears isStreaming and optionally records parseError', () => {
    const f = 'x.a2ui.json'
    const s = useChatStore.getState()
    s.appendUserMessage(f, 'hi')
    s.appendAssistantChunk(f, 'reply')
    s.endTurn(f, { success: false, parseError: 'no a2ui block' })
    const sess = useChatStore.getState().sessions[f]
    expect(sess.isStreaming).toBe(false)
    expect(sess.parseError).toBe('no a2ui block')
  })

  it('endTurn success clears any prior parseError', () => {
    const f = 'x.a2ui.json'
    const s = useChatStore.getState()
    s.appendUserMessage(f, 'hi')
    s.endTurn(f, { success: false, parseError: 'oops' })
    s.appendUserMessage(f, 'try again')
    s.endTurn(f, { success: true })
    expect(useChatStore.getState().sessions[f].parseError).toBeNull()
  })

  it('discardSession removes the entry', () => {
    const f = 'x.a2ui.json'
    useChatStore.getState().appendUserMessage(f, 'hi')
    useChatStore.getState().discardSession(f)
    expect(useChatStore.getState().sessions[f]).toBeUndefined()
  })
})
