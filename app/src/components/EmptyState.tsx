import { Blocks, FolderOpen, Play, Settings, Sparkles } from 'lucide-react'

interface Props {
  onNewProject: () => void
  onOpenProject: () => void
  onOpenSample: () => void
  onOpenSettings: () => void
}

export function EmptyState({ onNewProject, onOpenProject, onOpenSample, onOpenSettings }: Props) {
  return (
    <div className="empty-state">
      <button className="empty-settings-button" onClick={onOpenSettings} aria-label="Settings">
        <Settings size={17} />
      </button>
      <div className="empty-state-shell">
        <div className="empty-state-copy">
          <span className="overline">Local software cognition workbench</span>
          <h1>Delineation</h1>
          <p>Open a Project folder and turn real code into Views you can inspect, version, and discuss with an Agent.</p>
          <div className="empty-state-buttons">
            <button onClick={onNewProject} className="primary">
              <Blocks size={17} />
              <span>New Project</span>
            </button>
            <button onClick={onOpenProject}>
              <FolderOpen size={17} />
              <span>Open Project</span>
            </button>
            <button onClick={onOpenSample}>
              <Play size={16} />
              <span>Open Sample</span>
            </button>
          </div>
        </div>
        <div className="empty-preview" aria-hidden="true">
          <div className="preview-rail">
            <span />
            <span />
            <span />
          </div>
          <div className="preview-main">
            <div className="preview-tabs">
              <span />
              <span />
            </div>
            <div className="preview-node large"><Sparkles size={15} /> Subscription Flow</div>
            <div className="preview-node small">Facts</div>
            <div className="preview-terminal">$ agent inspect current-view</div>
          </div>
        </div>
      </div>
    </div>
  )
}
