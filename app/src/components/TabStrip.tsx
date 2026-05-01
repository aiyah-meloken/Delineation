interface Props {
  tabs: string[]
  activeTab: string | null
  onActivate: (filename: string) => void
  onClose: (filename: string) => void
}

function displayName(filename: string): string {
  return filename.replace(/\.html$/i, '')
}

export function TabStrip({ tabs, activeTab, onActivate, onClose }: Props) {
  return (
    <div className="tab-strip">
      {tabs.map((name) => (
        <div
          key={name}
          className={`tab ${name === activeTab ? 'active' : ''}`}
          onClick={() => onActivate(name)}
        >
          <span>{displayName(name)}</span>
          <button
            className="close"
            onClick={(e) => { e.stopPropagation(); onClose(name) }}
            aria-label={`Close ${name}`}
          >×</button>
        </div>
      ))}
    </div>
  )
}
