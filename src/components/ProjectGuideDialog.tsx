import { Blocks, FolderOpen, TriangleAlert, X } from 'lucide-react'

export type ProjectGuideMode = 'create' | 'initialize' | 'already-project'

export interface ProjectGuideState {
  mode: ProjectGuideMode
  path: string | null
  name: string
  error?: string | null
}

interface Props {
  state: ProjectGuideState
  onNameChange: (name: string) => void
  onChooseFolder: () => void
  onClose: () => void
  onCreate: () => void
  onInitialize: () => void
  onOpenExisting: () => void
}

function titleForMode(mode: ProjectGuideMode): string {
  if (mode === 'create') return 'New Project'
  if (mode === 'already-project') return 'Project Already Exists'
  return 'Initialize Project'
}

function descriptionForMode(mode: ProjectGuideMode): string {
  if (mode === 'create') return 'Create a Delineation Project in this folder. Existing files stay in place.'
  if (mode === 'already-project') return 'This folder already contains Delineation project settings.'
  return 'This folder is not a Delineation Project yet. Initialize it before opening so the app can track project settings.'
}

export function ProjectGuideDialog({
  state,
  onNameChange,
  onChooseFolder,
  onClose,
  onCreate,
  onInitialize,
  onOpenExisting,
}: Props) {
  const isCreate = state.mode === 'create'
  const isAlreadyProject = state.mode === 'already-project'
  const actionLabel = isCreate ? 'Create Project' : isAlreadyProject ? 'Open Project' : 'Initialize Project'
  const action = isCreate ? onCreate : isAlreadyProject ? onOpenExisting : onInitialize
  const hasPath = Boolean(state.path)

  return (
    <div className="project-guide-backdrop" role="presentation">
      <section
        className="project-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-guide-title"
      >
        <button className="project-guide-close" onClick={onClose} aria-label="Close Project guide">
          <X size={16} />
        </button>
        <div className="project-guide-icon">
          {state.mode === 'initialize' ? <TriangleAlert size={22} /> : <Blocks size={22} />}
        </div>
        <div className="project-guide-content">
          <span className="overline">Delineation Project</span>
          <h2 id="project-guide-title">{titleForMode(state.mode)}</h2>
          <p>{descriptionForMode(state.mode)}</p>

          <div className="project-guide-path">
            <FolderOpen size={15} />
            <span>{state.path ?? 'No folder selected'}</span>
            <button onClick={onChooseFolder}>
              {state.path ? 'Change' : 'Choose Folder'}
            </button>
          </div>

          {!isAlreadyProject && (
            <label className="project-guide-field">
              <span>Project Name</span>
              <input
                value={state.name}
                onChange={(event) => onNameChange(event.currentTarget.value)}
                autoFocus
              />
            </label>
          )}

          {state.error && <div className="project-guide-error">{state.error}</div>}

          <div className="project-guide-actions">
            <button onClick={onClose}>Cancel</button>
            <button className="primary" onClick={action} disabled={!hasPath}>
              {actionLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
