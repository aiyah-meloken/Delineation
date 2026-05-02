interface Props {
  projectName: string | null
  onOpenProject: () => void
}

export function TopBar({ projectName, onOpenProject }: Props) {
  return (
    <header className="top-bar">
      <span className="project-name">{projectName ?? 'No Project'}</span>
      <button onClick={onOpenProject}>Open Project…</button>
    </header>
  )
}
