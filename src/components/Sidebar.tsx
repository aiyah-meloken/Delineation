import {
  Blocks,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FolderPlus,
  FolderOpen,
  FolderTree,
  ScrollText,
  Settings,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { buildViewTree, type ViewTreeNode } from '../project/viewTree'

interface Props {
  projectName: string | null
  views: string[]
  folders: string[]
  activeView: string | null
  selectedFolder: string
  onSelect: (filename: string) => void
  onSelectFolder: (folderPath: string) => void
  onNewProject: () => void
  onOpenProject: () => void
  onNewFolder: (folderPath: string | undefined, name: string) => void
  onDeleteFolder: (folderPath: string) => void
  onRenameFolder: (folderPath: string, name: string) => void
  onDeleteView: (filename: string) => void
  onRenameView: (filename: string, name: string) => void
  onMoveView: (filename: string, targetFolder: string) => void
  onNewCanvas: (folderPath: string | undefined, name: string) => void
  onOpenSettings: () => void
  onRestartToUpdate: () => void
  updateReady: boolean
}

function displayName(filename: string): string {
  return filename.replace(/\.a2ui\.json$/i, '').replace(/\.html$/i, '')
}

function kindBadge(filename: string): string {
  if (filename.toLowerCase().endsWith('.a2ui.json')) return 'canvas'
  if (filename.toLowerCase().endsWith('.html')) return 'html'
  return ''
}

interface TreeNodeProps {
  node: ViewTreeNode
  activeView: string | null
  selectedFolder: string
  draft: DraftState
  depth: number
  draggingViewPath: string | null
  isDraggingView: boolean
  collapsedFolders: Set<string>
  dropTarget: string | null
  onSelect: (filename: string) => void
  onSelectFolder: (folderPath: string) => void
  onOpenContextMenu: (event: MouseEvent, target: ContextTarget) => void
  onStartRename: (filename: string, currentName: string) => void
  onToggleFolder: (folderPath: string) => void
  onBeginPointerDrag: (event: ReactPointerEvent, filename: string) => void
  onCommitDraft: (value: string) => void
  onCancelDraft: () => void
}

type ContextTarget =
  | { type: 'folder'; path: string }
  | { type: 'file'; path: string }

type DraftState =
  | { type: 'view'; folderPath: string; value: string }
  | { type: 'folder'; folderPath: string; value: string }
  | { type: 'rename'; path: string; value: string }
  | { type: 'renameFolder'; path: string; value: string }
  | null

interface PointerDragState {
  viewPath: string
  startX: number
  startY: number
  isDragging: boolean
}

function InlineNameInput({
  value,
  placeholder,
  depth,
  onCommit,
  onCancel,
}: {
  value: string
  placeholder: string
  depth: number
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      cancelledRef.current = true
      event.currentTarget.blur()
    }
  }

  function handleBlur() {
    if (cancelledRef.current) {
      onCancel()
      return
    }
    onCommit(inputRef.current?.value ?? '')
  }

  return (
    <li className="inline-name-row" style={{ paddingLeft: 7 + depth * 14 }}>
      <input
        ref={inputRef}
        defaultValue={value}
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </li>
  )
}

function TreeNode({
  node,
  activeView,
  selectedFolder,
  draft,
  depth,
  draggingViewPath,
  isDraggingView,
  collapsedFolders,
  dropTarget,
  onSelect,
  onSelectFolder,
  onOpenContextMenu,
  onStartRename,
  onToggleFolder,
  onBeginPointerDrag,
  onCommitDraft,
  onCancelDraft,
}: TreeNodeProps) {
  if (node.type === 'folder') {
    const collapsed = collapsedFolders.has(node.path)

    if (draft?.type === 'renameFolder' && draft.path === node.path) {
      return (
        <InlineNameInput
          value={draft.value}
          placeholder="Rename Folder"
          depth={depth}
          onCommit={onCommitDraft}
          onCancel={onCancelDraft}
        />
      )
    }

    return (
      <div
        className={`folder-group ${dropTarget === node.path ? 'drop-within' : ''}`}
        data-folder-group={node.path}
      >
        <li
          className={`folder-row ${node.path === selectedFolder ? 'selected-folder' : ''}`}
          data-drop-folder={node.path}
          style={{ paddingLeft: 7 + depth * 14 }}
          onClick={() => onSelectFolder(node.path)}
          onContextMenu={(event) => onOpenContextMenu(event, { type: 'folder', path: node.path })}
        >
          <button
            className="folder-toggle"
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${node.path}`}
            onClick={(event) => {
              event.stopPropagation()
              onToggleFolder(node.path)
            }}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
          <FolderTree size={15} />
          <span>{node.name}</span>
        </li>
        {!collapsed && node.children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            activeView={activeView}
            selectedFolder={selectedFolder}
            draft={draft}
            depth={depth + 1}
            draggingViewPath={draggingViewPath}
            isDraggingView={isDraggingView}
            collapsedFolders={collapsedFolders}
            dropTarget={dropTarget}
            onSelect={onSelect}
            onSelectFolder={onSelectFolder}
            onOpenContextMenu={onOpenContextMenu}
            onStartRename={onStartRename}
            onToggleFolder={onToggleFolder}
            onBeginPointerDrag={onBeginPointerDrag}
            onCommitDraft={onCommitDraft}
            onCancelDraft={onCancelDraft}
          />
        ))}
      </div>
    )
  }

  if (draft?.type === 'rename' && draft.path === node.path) {
    return (
      <InlineNameInput
        value={draft.value}
        placeholder="Rename View"
        depth={depth}
        onCommit={onCommitDraft}
        onCancel={onCancelDraft}
      />
    )
  }

  return (
    <li
      className={`${node.path === activeView ? 'active' : ''} ${isDraggingView && node.path === draggingViewPath ? 'dragging' : ''}`}
      style={{ paddingLeft: 7 + depth * 14 }}
      data-view-row
      onPointerDown={(event) => onBeginPointerDrag(event, node.path)}
      onClick={() => onSelect(node.path)}
      onDoubleClick={() => onStartRename(node.path, displayName(node.name))}
      onContextMenu={(event) => onOpenContextMenu(event, { type: 'file', path: node.path })}
    >
      <span className="view-icon"><ScrollText size={15} /></span>
      <span className="view-name">{displayName(node.name)}</span>
      <span className={`view-kind kind-${kindBadge(node.name)}`}>{kindBadge(node.name)}</span>
    </li>
  )
}

export function Sidebar({
  projectName,
  views,
  folders,
  activeView,
  selectedFolder,
  onSelect,
  onSelectFolder,
  onNewProject,
  onOpenProject,
  onNewFolder,
  onDeleteFolder,
  onRenameFolder,
  onDeleteView,
  onRenameView,
  onMoveView,
  onNewCanvas,
  onOpenSettings,
  onRestartToUpdate,
  updateReady,
}: Props) {
  const tree = buildViewTree(views, folders)
  const [draft, setDraft] = useState<DraftState>(null)
  const [draggedViewPath, setDraggedViewPath] = useState<string | null>(null)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set())
  const [pointerDrag, setPointerDrag] = useState<PointerDragState | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const pointerDragRef = useRef<PointerDragState | null>(null)
  const suppressNextSelectRef = useRef<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    target: ContextTarget
  } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [contextMenu])

  useEffect(() => {
    if (!pointerDrag) return

    function folderAtPoint(clientX: number, clientY: number): string | null {
      const element = document.elementFromPoint?.(clientX, clientY)
      const dropElement = element?.closest('[data-drop-folder]')
      if (!dropElement) return null
      if (dropElement.classList.contains('view-list')) {
        const row = element?.closest('li')
        if (row && !row.hasAttribute('data-drop-folder')) return null
      }
      return dropElement.getAttribute('data-drop-folder') ?? null
    }

    function handlePointerMove(event: PointerEvent) {
      setPointerDrag((current) => {
        if (!current) return null
        const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
        const isDragging = current.isDragging || distance > 3
        if (isDragging) setDropTarget(folderAtPoint(event.clientX, event.clientY))
        const next = { ...current, isDragging }
        pointerDragRef.current = next
        return next
      })
    }

    function handlePointerUp(event: PointerEvent) {
      const targetFolder = folderAtPoint(event.clientX, event.clientY)
      const current = pointerDragRef.current
      if (current?.isDragging && targetFolder !== null) {
        suppressNextSelectRef.current = current.viewPath
        onMoveView(current.viewPath, targetFolder)
      }
      pointerDragRef.current = null
      setPointerDrag(null)
      setDraggedViewPath(null)
      setDropTarget(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [onMoveView, pointerDrag])

  function openContextMenu(event: MouseEvent, target: ContextTarget) {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY, target })
  }

  function closeContextMenu() {
    setContextMenu(null)
  }

  function currentFolderLabel(folderPath: string): string {
    if (!folderPath) return 'Project Root'
    return folderPath
  }

  function startCreateView(folderPath = selectedFolder) {
    setContextMenu(null)
    onSelectFolder(folderPath)
    setDraft({ type: 'view', folderPath, value: 'Untitled' })
  }

  function startCreateFolder(folderPath = selectedFolder) {
    setContextMenu(null)
    onSelectFolder(folderPath)
    setDraft({ type: 'folder', folderPath, value: 'New Folder' })
  }

  function toggleFolder(folderPath: string) {
    setCollapsedFolders((current) => {
      const next = new Set(current)
      if (next.has(folderPath)) next.delete(folderPath)
      else next.add(folderPath)
      return next
    })
  }

  function startRenameView(filename: string, currentName: string) {
    setContextMenu(null)
    setDraft({ type: 'rename', path: filename, value: currentName })
  }

  function startRenameFolder(folderPath: string) {
    setContextMenu(null)
    setDraft({
      type: 'renameFolder',
      path: folderPath,
      value: folderPath.split('/').pop() ?? folderPath,
    })
  }

  function commitDraft(value: string) {
    const activeDraft = draft
    setDraft(null)
    const name = value.trim()
    if (!activeDraft || !name) return

    if (activeDraft.type === 'view') {
      onNewCanvas(activeDraft.folderPath, name)
    } else if (activeDraft.type === 'folder') {
      onNewFolder(activeDraft.folderPath, name)
    } else if (activeDraft.type === 'rename') {
      onRenameView(activeDraft.path, name)
    } else {
      onRenameFolder(activeDraft.path, name)
    }
  }

  function handleBeginPointerDrag(event: ReactPointerEvent, viewPath: string) {
    if (event.button !== 0) return
    event.preventDefault()
    const next = {
      viewPath,
      startX: event.clientX,
      startY: event.clientY,
      isDragging: false,
    }
    pointerDragRef.current = next
    setPointerDrag(next)
    setDraggedViewPath(viewPath)
    setDropTarget(null)
  }

  function handleSelectView(filename: string) {
    if (suppressNextSelectRef.current === filename) {
      suppressNextSelectRef.current = null
      return
    }
    onSelect(filename)
  }

  return (
    <aside className="sidebar">
      <nav className="activity-rail" aria-label="Primary navigation">
        <div className="activity-group">
          <div className="activity-button active" title="Explorer" aria-label="Explorer">
            <FolderOpen size={18} />
          </div>
        </div>
        <div className="activity-group">
          <button
            className={`activity-button ${updateReady ? 'has-update' : ''}`}
            onClick={updateReady ? onRestartToUpdate : onOpenSettings}
            title={updateReady ? 'Restart to Update' : 'Settings'}
            aria-label={updateReady ? 'Restart and install update' : 'Settings'}
          >
            <Settings size={18} />
          </button>
        </div>
      </nav>
      <section className="explorer-pane">
        <div className="project-strip">
          <div className="project-lockup">
            <span className="brand-mark">D</span>
            <div>
              <div className="project-name">{projectName ?? 'Delineation'}</div>
              <div className="project-scope">{projectName ? 'Project' : 'No project open'}</div>
            </div>
          </div>
          <div className="project-actions">
            <button
              className="icon-button compact"
              onClick={onOpenProject}
              aria-label="Open Project"
              data-tooltip="Open Project"
            >
              <FolderOpen size={15} />
            </button>
            <button
              className="icon-button compact"
              onClick={onNewProject}
              aria-label="New Project"
              data-tooltip="New Project"
            >
              <Blocks size={15} />
            </button>
          </div>
        </div>
        <div className="sidebar-header">
          <span>Files</span>
          <div className="sidebar-actions">
            <button className="sidebar-action-button" onClick={() => startCreateView()} title="New View">
              <FilePlus2 size={14} />
              <span>View</span>
            </button>
            <button className="sidebar-action-button" onClick={() => startCreateFolder()} title="New Folder">
              <FolderPlus size={14} />
              <span>Folder</span>
            </button>
          </div>
        </div>
        <ul
          className={`view-list ${selectedFolder === '' ? 'root-selected' : ''} ${dropTarget === '' ? 'drop-target' : ''}`}
          data-drop-folder=""
          onClick={(event) => {
            if (event.currentTarget === event.target) onSelectFolder('')
          }}
          onContextMenu={(event) => {
            if (event.currentTarget === event.target) openContextMenu(event, { type: 'folder', path: '' })
          }}
        >
          {(draft?.type === 'view' || draft?.type === 'folder') && (
            <InlineNameInput
              value={draft.value}
              placeholder={`${draft.type === 'view' ? 'New View' : 'New Folder'} in ${currentFolderLabel(draft.folderPath)}`}
              depth={draft.folderPath ? draft.folderPath.split('/').length : 0}
              onCommit={commitDraft}
              onCancel={() => setDraft(null)}
            />
          )}
          {views.length === 0 && folders.length === 0 && (
            <li className="empty-hint">
              <FolderTree size={15} />
              <span>No views found.</span>
            </li>
          )}
          {tree.children.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              activeView={activeView}
              selectedFolder={selectedFolder}
              draft={draft}
              depth={0}
              draggingViewPath={draggedViewPath}
              isDraggingView={pointerDrag?.isDragging ?? false}
              collapsedFolders={collapsedFolders}
              dropTarget={dropTarget}
              onSelect={handleSelectView}
              onSelectFolder={onSelectFolder}
              onOpenContextMenu={openContextMenu}
              onStartRename={startRenameView}
              onToggleFolder={toggleFolder}
              onBeginPointerDrag={handleBeginPointerDrag}
              onCommitDraft={commitDraft}
              onCancelDraft={() => setDraft(null)}
            />
          ))}
        </ul>
        <div className="vault-status">
          <span>{projectName ?? 'No Project'}</span>
          {updateReady && (
            <button className="vault-update-button" onClick={onRestartToUpdate}>
              Restart to Update
            </button>
          )}
        </div>
      </section>
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.target.type === 'file' && (
            <>
              <button
                onClick={() => {
                  onSelect(contextMenu.target.path)
                  closeContextMenu()
                }}
              >
                Open
              </button>
              <button
                onClick={() => {
                  startRenameView(
                    contextMenu.target.path,
                    displayName(contextMenu.target.path.split('/').pop() ?? contextMenu.target.path),
                  )
                  closeContextMenu()
                }}
              >
                Rename View
              </button>
              <button
                className="danger"
                onClick={() => {
                  onDeleteView(contextMenu.target.path)
                  closeContextMenu()
                }}
              >
                Delete View
              </button>
            </>
          )}
          {contextMenu.target.type === 'folder' && (
            <>
              <button
                onClick={() => {
                  onSelectFolder(contextMenu.target.path)
                  closeContextMenu()
                }}
              >
                Select Folder
              </button>
              {contextMenu.target.path && (
                <>
                  <button
                    onClick={() => {
                      startRenameFolder(contextMenu.target.path)
                      closeContextMenu()
                    }}
                  >
                    Rename Folder
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      onDeleteFolder(contextMenu.target.path)
                      closeContextMenu()
                    }}
                  >
                    Delete Folder
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  startCreateView(contextMenu.target.path)
                  closeContextMenu()
                }}
              >
                New View Here
              </button>
              <button
                onClick={() => {
                  startCreateFolder(contextMenu.target.path)
                  closeContextMenu()
                }}
              >
                New Folder Here
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  )
}
