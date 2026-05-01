interface Props {
  onOpenProject: () => void
  onOpenSample: () => void
}

export function EmptyState({ onOpenProject, onOpenSample }: Props) {
  return (
    <div className="empty-state">
      <h1>Delineation</h1>
      <p>Open a Project folder to browse its Views.</p>
      <div className="empty-state-buttons">
        <button onClick={onOpenProject} className="primary">Open Project…</button>
        <button onClick={onOpenSample}>Open Sample Project</button>
      </div>
    </div>
  )
}
