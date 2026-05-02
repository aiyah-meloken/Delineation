interface Props {
  views: string[]
  activeView: string | null
  onSelect: (filename: string) => void
  onRefresh: () => void
}

function displayName(filename: string): string {
  return filename.replace(/\.html$/i, '')
}

export function Sidebar({ views, activeView, onSelect, onRefresh }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>Views</span>
        <button onClick={onRefresh} title="Re-scan project folder">Refresh</button>
      </div>
      <ul className="view-list">
        {views.length === 0 && <li className="empty-hint">No .html files found.</li>}
        {views.map((name) => (
          <li
            key={name}
            className={name === activeView ? 'active' : ''}
            onClick={() => onSelect(name)}
          >
            {displayName(name)}
          </li>
        ))}
      </ul>
    </aside>
  )
}
