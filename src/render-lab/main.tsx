import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { A2UIViewDocument } from '../a2ui/view'
import { parseA2UIViewText } from '../a2ui/view'
import { A2UIViewRenderer } from '../components/A2UIViewRenderer'
import '../styles.css'
import './render-lab.css'

function fixtureUrl(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('fixture') ?? 'http://127.0.0.1:4319/legacy-card-gap.json'
}

function RenderLab() {
  const [url, setUrl] = useState(fixtureUrl)
  const [document, setDocument] = useState<A2UIViewDocument | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setDocument(null)
      setError(null)
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
        const parsed = parseA2UIViewText(await response.text())
        if (parsed.kind !== 'a2ui-view') throw new Error('Fixture did not contain an A2UI View document.')
        if (!cancelled) setDocument(parsed.document)
      } catch (err) {
        if (!cancelled) setError(String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <main className="render-lab">
      <header className="render-lab-toolbar">
        <div>
          <strong>A2UI Render Lab</strong>
          <span>frontend + fixture backend</span>
        </div>
        <input value={url} onChange={(event) => setUrl(event.target.value)} aria-label="Fixture URL" />
      </header>
      <section className="render-lab-surface">
        {error && (
          <div className="viewer-empty">
            <div className="empty-card">
              <h2>Render Lab Error</h2>
              <p>{error}</p>
            </div>
          </div>
        )}
        {document && <A2UIViewRenderer document={document} />}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RenderLab />
  </React.StrictMode>,
)
