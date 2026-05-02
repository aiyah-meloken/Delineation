interface Props {
  /** Raw HTML content for the active view, or null if no tab is active. */
  html: string | null
  /** Used as the iframe key so React remounts on tab switch. */
  viewKey: string | null
}

export function ViewerPane({ html, viewKey }: Props) {
  if (html === null) {
    return (
      <div className="viewer-empty">
        <p>No view open. Pick one from the sidebar.</p>
      </div>
    )
  }
  return (
    <iframe
      key={viewKey ?? 'none'}
      className="viewer-iframe"
      sandbox=""
      srcDoc={html}
      title={viewKey ?? 'view'}
    />
  )
}
