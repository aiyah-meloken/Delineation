import { useEffect, useMemo, useState } from 'react'
import { MessageProcessor, type SurfaceModel } from '@a2ui/web_core/v0_9'
import { renderMarkdown } from '@a2ui/markdown-it'
import {
  A2uiSurface,
  MarkdownContext,
  basicCatalog,
  type ReactComponentImplementation,
} from '@a2ui/react/v0_9'
import type { A2UIViewDocument } from '../a2ui/view'
import type { ViewVersionInfo } from '../tauri/control'

interface Props {
  document: A2UIViewDocument
  versions?: ViewVersionInfo[]
  selectedVersionId?: string | null
  onSelectVersion?: (versionId: string) => void
  onShowCurrent?: () => void
}

export function A2UIViewRenderer({
  document,
  versions = [],
  selectedVersionId = null,
  onSelectVersion,
  onShowCurrent,
}: Props) {
  const [surface, setSurface] = useState<SurfaceModel<ReactComponentImplementation> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const processor = useMemo(() => new MessageProcessor([basicCatalog]), [document])

  useEffect(() => {
    setSurface(null)
    setError(null)
    const sub = processor.onSurfaceCreated((created) => {
      setSurface(created)
    })

    try {
      processor.processMessages(document.a2uiMessages)
    } catch (err) {
      setError(String(err))
    }

    return () => sub.unsubscribe()
  }, [document, processor])

  return (
    <div className="a2ui-view-host">
      <div className="a2ui-view-meta" aria-label="View metadata">
        <span>{document.status}</span>
        {selectedVersionId && <span>Previewing {selectedVersionId}</span>}
        <span>{versions.length} version{versions.length === 1 ? '' : 's'}</span>
        {document.updatedAt && <span>{new Date(document.updatedAt).toLocaleString()}</span>}
        {selectedVersionId && onShowCurrent && (
          <button className="a2ui-meta-button" onClick={onShowCurrent}>
            Current
          </button>
        )}
      </div>
      {error ? (
        <div className="viewer-empty">
          <div className="empty-card">
            <h2>A2UI render failed</h2>
            <p>{error}</p>
          </div>
        </div>
      ) : surface ? (
        <>
          <div className="a2ui-surface">
            <MarkdownContext.Provider value={renderMarkdown}>
              <A2uiSurface surface={surface} />
            </MarkdownContext.Provider>
          </div>
          {document.facts.length > 0 && (
            <section className="a2ui-facts" aria-label="View facts">
              <h2>Based on Facts</h2>
              <div className="a2ui-fact-list">
                {document.facts.map((fact) => (
                  <div className="a2ui-fact" key={fact.id}>
                    <span>{fact.label}</span>
                    {fact.source && <code>{fact.source}</code>}
                  </div>
                ))}
              </div>
            </section>
          )}
          {versions.length > 0 && (
            <section className="a2ui-versions" aria-label="View versions">
              <h2>Versions</h2>
              <div className="a2ui-version-list">
                {versions.slice(0, 6).map((version) => (
                  <button
                    className={`a2ui-version ${version.id === selectedVersionId ? 'active' : ''}`}
                    key={version.id}
                    onClick={() => onSelectVersion?.(version.id)}
                    type="button"
                    aria-label={`Preview version ${version.id}`}
                  >
                    <code>{version.id}</code>
                    <span>{new Date(version.createdAt).toLocaleString()}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="viewer-empty">
          <div className="empty-card">
            <p>Initializing A2UI View...</p>
          </div>
        </div>
      )}
    </div>
  )
}
