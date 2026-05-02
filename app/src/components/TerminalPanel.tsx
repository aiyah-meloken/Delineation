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
      theme: { background: '#1e1e1e' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(hostRef.current)
    fit.fit()

    const unsubs: Array<() => void> = []
    let cancelled = false

    ;(async () => {
      try {
        const sid = await spawnTerminal(projectPath)
        if (cancelled) {
          killTerminal(sid).catch(() => {})
          return
        }
        sessionIdRef.current = sid

        // Initial size sync
        await resizeTerminal(sid, term.cols, term.rows).catch(() => {})

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

        // Forward user keystrokes
        const sub = term.onData((data) => {
          const b = btoa(data)
          writeTerminal(sid, b).catch((err) => console.error('term_write failed:', err))
        })
        unsubs.push(() => sub.dispose())
      } catch (err) {
        console.error('terminal spawn failed:', err)
        term.writeln(`\r\n[failed to launch terminal: ${String(err)}]`)
      }
    })()

    // Resize observer
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        const sid = sessionIdRef.current
        if (sid) resizeTerminal(sid, term.cols, term.rows).catch(() => {})
      } catch (err) {
        console.error('resize failed:', err)
      }
    })
    ro.observe(hostRef.current)

    return () => {
      cancelled = true
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
