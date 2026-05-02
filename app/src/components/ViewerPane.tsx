import type { A2UIGraph } from '../a2ui/schema'
import { CanvasViewer } from './CanvasViewer'

interface Props {
  /** Active filename (drives extension dispatch). null when no tab is active. */
  filename: string | null
  /** Raw HTML content for an .html view, null otherwise. */
  html: string | null
  /** A2UI graph for an .a2ui.json view, null otherwise. */
  graph: A2UIGraph | null
  /** Parse error, if any (canvas only). */
  parseError?: string | null
}

export function ViewerPane({ filename, html, graph, parseError }: Props) {
  if (!filename) {
    return (
      <div className="viewer-empty">
        <p>No view open. Pick one from the sidebar.</p>
      </div>
    )
  }

  if (filename.toLowerCase().endsWith('.a2ui.json')) {
    return <CanvasViewer graph={graph} parseError={parseError} />
  }

  if (filename.toLowerCase().endsWith('.html')) {
    if (html === null) {
      return <div className="viewer-empty"><p>Loading…</p></div>
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
      <p>Unsupported view type: {filename}</p>
    </div>
  )
}
