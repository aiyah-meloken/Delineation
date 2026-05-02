interface Props {
  views: string[]
  activeView: string | null
  onSelect: (filename: string) => void
  onRefresh: () => void
  onNewCanvas: () => void
}

function displayName(filename: string): string {
  return filename.replace(/\.a2ui\.json$/i, '').replace(/\.html$/i, '')
}

function kindBadge(filename: string): string {
  if (filename.toLowerCase().endsWith('.a2ui.json')) return 'canvas'
  if (filename.toLowerCase().endsWith('.html')) return 'html'
  return ''
}

export function Sidebar({ views, activeView, onSelect, onRefresh, onNewCanvas }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>Views</span>
        <div className="sidebar-actions">
          <button onClick={onNewCanvas} title="Create a new A2UI canvas">+ Canvas</button>
          <button onClick={onRefresh} title="Re-scan project folder">Refresh</button>
        </div>
      </div>
      <ul className="view-list">
        {views.length === 0 && <li className="empty-hint">No views found.</li>}
        {views.map((name) => (
          <li
            key={name}
            className={name === activeView ? 'active' : ''}
            onClick={() => onSelect(name)}
          >
            <span className="view-name">{displayName(name)}</span>
            <span className={`view-kind kind-${kindBadge(name)}`}>{kindBadge(name)}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
