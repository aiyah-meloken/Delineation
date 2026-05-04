import { FolderOpen, PanelLeft, Search, Settings2, Zap } from 'lucide-react'

interface Props {
  projectName: string | null
  onOpenProject: () => void
}

export function TopBar({ projectName, onOpenProject }: Props) {
  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <button className="icon-button" title="Toggle sidebar" aria-label="Toggle sidebar">
          <PanelLeft size={17} />
        </button>
        <div className="brand-lockup">
          <span className="brand-mark">D</span>
          <div>
            <div className="project-name">{projectName ?? 'Delineation'}</div>
            <div className="project-scope">{projectName ? 'Project' : 'No project open'}</div>
          </div>
        </div>
      </div>
      <div className="top-bar-center" role="search">
        <Search size={15} />
        <span>Search views, facts, sessions</span>
      </div>
      <div className="top-bar-actions">
        <button className="icon-button" title="LensKit" aria-label="LensKit">
          <Zap size={17} />
        </button>
        <button className="icon-button" title="Settings" aria-label="Settings">
          <Settings2 size={17} />
        </button>
        <button className="open-project-button" onClick={onOpenProject}>
          <FolderOpen size={16} />
          <span>Open Project</span>
        </button>
      </div>
    </header>
  )
}
