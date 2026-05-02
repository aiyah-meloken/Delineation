import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ChatMessage } from '../store/chatStore'

interface Props {
  messages: ChatMessage[]
  isStreaming: boolean
  parseError: string | null
  onSend: (text: string) => void
  disabledReason?: string | null
}

export function ChatPanel({ messages, isStreaming, parseError, onSend, disabledReason }: Props) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, isStreaming])

  function submit() {
    const text = draft.trim()
    if (!text || isStreaming || disabledReason) return
    setDraft('')
    onSend(text)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && !parseError && (
          <div className="chat-hint">Type something like "分析 src/auth/login.ts" and press Enter.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg-${m.role}`}>
            <div className="chat-role">{m.role}</div>
            <div className="chat-text">{m.text}</div>
          </div>
        ))}
        {isStreaming && <div className="chat-streaming">…</div>}
        {parseError && <div className="chat-error">{parseError}</div>}
      </div>
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={disabledReason ?? 'Describe the workflow to analyze…'}
          disabled={Boolean(disabledReason)}
          rows={2}
        />
        <button onClick={submit} disabled={isStreaming || Boolean(disabledReason) || !draft.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
