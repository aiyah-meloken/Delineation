import { Bug, RotateCw, X } from 'lucide-react'
import type { AppInfo, UpdateState } from '../tauri/update'

interface Props {
  appInfo: AppInfo
  updateState: UpdateState
  onClose: () => void
  onRestartToUpdate: () => void
  onOpenInspector: () => void
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function updateDetail(updateState: UpdateState): string {
  if (updateState.phase !== 'downloading') return updateState.message
  if (!updateState.totalBytes) return updateState.message
  return `${updateState.message} ${formatBytes(updateState.downloadedBytes ?? 0)} / ${formatBytes(updateState.totalBytes)}`
}

export function SettingsDialog({
  appInfo,
  updateState,
  onClose,
  onRestartToUpdate,
  onOpenInspector,
}: Props) {
  const canRestart = updateState.phase === 'ready'

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="settings-close" onClick={onClose} aria-label="Close Settings">
          <X size={15} />
        </button>
        <header className="settings-header">
          <span className="brand-mark">D</span>
          <div>
            <h2 id="settings-title">Settings</h2>
            <p>{appInfo.name}</p>
          </div>
        </header>
        <div className="settings-section">
          <div className="settings-row">
            <div>
              <div className="settings-label">Version</div>
              <div className="settings-value">{appInfo.version}</div>
            </div>
            <button className="restart-update-button" onClick={onOpenInspector}>
              <Bug size={14} />
              <span>Open Inspector</span>
            </button>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Updates</div>
              <div className={`settings-value update-${updateState.phase}`}>
                {updateDetail(updateState)}
              </div>
            </div>
            {canRestart && (
              <button className="restart-update-button" onClick={onRestartToUpdate}>
                <RotateCw size={14} />
                <span>Restart to Update</span>
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
