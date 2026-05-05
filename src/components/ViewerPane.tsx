import type { A2UIGraph } from '../a2ui/schema'
import type { A2UIViewDocument } from '../a2ui/view'
import type { ViewVersionInfo } from '../tauri/control'
import { CanvasViewer } from './CanvasViewer'
import { A2UIViewRenderer } from './A2UIViewRenderer'
import { CircleDot, FileText, History, Link2 } from 'lucide-react'

interface Props {
  /** Active filename (drives extension dispatch). null when no tab is active. */
  filename: string | null
  /** Raw HTML content for an .html view, null otherwise. */
  html: string | null
  /** A2UI graph for an .a2ui.json view, null otherwise. */
  graph: A2UIGraph | null
  /** A2UI v0.9 View document for an .a2ui.json view, null otherwise. */
  a2uiView?: A2UIViewDocument | null
  versions?: ViewVersionInfo[]
  /** Parse error, if any (canvas only). */
  parseError?: string | null
}

export function ViewerPane({ filename, html, graph, a2uiView, versions = [], parseError }: Props) {
  if (!filename) {
    return (
      <div className="viewer-empty">
        <div className="empty-card">
          <CircleDot size={22} />
          <h2>No View Open</h2>
          <p>Pick a View from the sidebar, or create a new A2UI View to start shaping the project map.</p>
        </div>
      </div>
    )
  }

  if (filename.toLowerCase().endsWith('.a2ui.json')) {
    if (a2uiView) return <A2UIViewRenderer document={a2uiView} versions={versions} />
    return <CanvasViewer graph={graph} parseError={parseError} />
  }

  if (filename.toLowerCase().endsWith('.html')) {
    if (html === null) {
      return <div className="viewer-empty"><div className="empty-card"><p>Loading...</p></div></div>
    }
    return (
      <iframe
        key={filename}
        className="viewer-iframe"
        sandbox=""
        srcDoc={html}
        title={filename}
      />
    )
  }

  return (
    <div className="viewer-empty">
      <div className="empty-card">
        <FileText size={22} />
        <h2>Unsupported View</h2>
        <p>{filename}</p>
      </div>
    </div>
  )
}

export function ViewInspector({ filename }: { filename: string | null }) {
  return (
    <aside className="view-inspector">
      <section>
        <div className="inspector-title">
          <FileText size={15} />
          <span>View</span>
        </div>
        <h3>{filename ? filename.replace(/\.a2ui\.json$/i, '').replace(/\.html$/i, '') : 'Nothing selected'}</h3>
        <div className="status-row">
          <span className="status-dot reviewed" />
          <span>{filename ? 'Draft' : 'Idle'}</span>
        </div>
      </section>
      <section>
        <div className="inspector-title">
          <Link2 size={15} />
          <span>Facts</span>
        </div>
        <p className="muted">Facts will be listed inside each View as LensKit output matures.</p>
      </section>
      <section>
        <div className="inspector-title">
          <History size={15} />
          <span>Versions</span>
        </div>
        <div className="version-row">
          <span>v0</span>
          <span>Current workspace state</span>
        </div>
      </section>
    </aside>
  )
}
