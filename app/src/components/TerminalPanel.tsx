import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import type { A2UIGraph } from '../a2ui/schema'
import {
  spawnTerminal,
  writeTerminal,
  resizeTerminal,
  killTerminal,
  onTermData,
  onTermExit,
  onGraph,
} from '../tauri/term'

interface Props {
  projectPath: string
  /** Stable identifier so each canvas tab gets its own terminal. */
  paneKey: string
  onGraphReady?: (graph: A2UIGraph) => void
}

export function TerminalPanel({ projectPath, paneKey, onGraphReady }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!hostRef.current) return

    const term = new Terminal({
      fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      convertEol: false,
      allowProposedApi: true,
      scrollback: 5000,
      theme: { background: '#1e1e1e' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(hostRef.current)

    // Two layout passes: first paint can report 0 dimensions; one more frame
    // after that has a real size for fit() to use.
    let unsubs: Array<() => void> = []
    let cancelled = false
    let lastSentCols = 0
    let lastSentRows = 0
    let resizeTimer: number | null = null

    const sendResize = (sid: string) => {
      if (term.cols === lastSentCols && term.rows === lastSentRows) return
      if (term.cols < 2 || term.rows < 2) return
      lastSentCols = term.cols
      lastSentRows = term.rows
      resizeTerminal(sid, term.cols, term.rows).catch(() => {})
    }

    const initialize = () => {
      try {
        fit.fit()
      } catch {
        // Fit may throw if the host has zero size; we'll catch up in the RO.
      }

      ;(async () => {
        try {
          // Use the post-fit dimensions as the PTY's initial size so claude's
          // TUI never has to redraw mid-stream because the size changed.
          const cols = term.cols && term.cols >= 2 ? term.cols : 80
          const rows = term.rows && term.rows >= 2 ? term.rows : 24
          const sid = await spawnTerminal(projectPath, cols, rows)
          if (cancelled) {
            killTerminal(sid).catch(() => {})
            return
          }
          sessionIdRef.current = sid
          lastSentCols = cols
          lastSentRows = rows

          unsubs.push(
            await onTermData(({ session_id, bytes_b64 }) => {
              if (session_id !== sid) return
              try {
                const bin = atob(bytes_b64)
                const u8 = new Uint8Array(bin.length)
                for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
                term.write(u8)
              } catch (err) {
                console.error('term data decode failed:', err)
              }
            }),
            await onTermExit(({ session_id }) => {
              if (session_id !== sid) return
              term.writeln('\r\n[session exited]')
            }),
            await onGraph(({ session_id, graph }) => {
              if (session_id !== sid) return
              onGraphReady?.(graph)
            }),
          )

          // Forward user keystrokes.
          const sub = term.onData((data) => {
            const b = btoa(data)
            writeTerminal(sid, b).catch((err) => console.error('term_write failed:', err))
          })
          unsubs.push(() => sub.dispose())
          term.focus()
        } catch (err) {
          console.error('terminal spawn failed:', err)
          term.writeln(`\r\n[failed to launch terminal: ${String(err)}]`)
        }
      })()
    }

    // Wait one animation frame so layout is stable before measuring.
    const rafId = requestAnimationFrame(initialize)

    // Debounced resize: collapse a burst of layout changes into one PTY resize.
    const ro = new ResizeObserver(() => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null
        try {
          fit.fit()
        } catch {
          return
        }
        const sid = sessionIdRef.current
        if (sid) sendResize(sid)
      }, 120)
    })
    ro.observe(hostRef.current)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      ro.disconnect()
      unsubs.forEach((f) => f())
      const sid = sessionIdRef.current
      if (sid) killTerminal(sid).catch(() => {})
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneKey, projectPath])

  return <div ref={hostRef} className="terminal-host" />
}
