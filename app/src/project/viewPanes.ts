export interface ViewPane {
  id: string
  tabs: string[]
  activeTab: string | null
}

export type SplitSide = 'left' | 'right'

export function createEmptyPane(id: string): ViewPane {
  return { id, tabs: [], activeTab: null }
}

function fallbackPane(panes: ViewPane[]): ViewPane[] {
  return panes.length > 0 ? panes : [createEmptyPane('pane-1')]
}

function activeAfterClose(tabs: string[], previousActive: string | null, closedFilename: string, closedIndex: number): string | null {
  if (previousActive !== closedFilename) return previousActive
  return tabs[closedIndex] ?? tabs[closedIndex - 1] ?? null
}

export function openPaneTab(panes: ViewPane[], activePaneId: string | null, filename: string): ViewPane[] {
  const existingPane = panes.find((pane) => pane.tabs.includes(filename))
  if (existingPane) {
    return panes.map((pane) => (
      pane.id === existingPane.id ? { ...pane, activeTab: filename } : pane
    ))
  }

  const targetPaneId = activePaneId ?? panes[0]?.id
  const next = panes.map((pane) => {
    if (pane.id !== targetPaneId) return pane
    return { ...pane, tabs: [...pane.tabs, filename], activeTab: filename }
  })

  if (next.some((pane) => pane.tabs.includes(filename))) return next
  const empty = createEmptyPane(targetPaneId ?? 'pane-1')
  return [{ ...empty, tabs: [filename], activeTab: filename }]
}

export function activatePaneTab(panes: ViewPane[], paneId: string, filename: string): ViewPane[] {
  return panes.map((pane) => (
    pane.id === paneId && pane.tabs.includes(filename)
      ? { ...pane, activeTab: filename }
      : pane
  ))
}

export function closePaneTab(panes: ViewPane[], filename: string, paneId?: string): ViewPane[] {
  const next = panes
    .map((pane) => {
      if (paneId && pane.id !== paneId) return pane
      const index = pane.tabs.indexOf(filename)
      if (index === -1) return pane
      const tabs = pane.tabs.filter((tab) => tab !== filename)
      return {
        ...pane,
        tabs,
        activeTab: activeAfterClose(tabs, pane.activeTab, filename, index),
      }
    })
    .filter((pane, _index, all) => pane.tabs.length > 0 || all.length === 1)

  return fallbackPane(next)
}

export function reorderPaneTab(
  panes: ViewPane[],
  paneId: string,
  draggedFilename: string,
  targetFilename: string,
): ViewPane[] {
  if (draggedFilename === targetFilename) return panes
  return panes.map((pane) => {
    if (pane.id !== paneId) return pane
    const from = pane.tabs.indexOf(draggedFilename)
    const to = pane.tabs.indexOf(targetFilename)
    if (from === -1 || to === -1) return pane
    const tabs = [...pane.tabs]
    const [dragged] = tabs.splice(from, 1)
    tabs.splice(to, 0, dragged)
    return { ...pane, tabs }
  })
}

export function splitPaneTab(
  panes: ViewPane[],
  sourcePaneId: string,
  filename: string,
  side: SplitSide,
  newPaneId: string,
): ViewPane[] {
  const sourceIndex = panes.findIndex((pane) => pane.id === sourcePaneId)
  if (sourceIndex === -1) return panes
  const source = panes[sourceIndex]
  const tabIndex = source.tabs.indexOf(filename)
  if (tabIndex === -1) return panes

  if (source.tabs.length === 1) {
    const newPane: ViewPane = { id: newPaneId, tabs: [filename], activeTab: filename }
    const next = [...panes]
    next.splice(side === 'left' ? sourceIndex : sourceIndex + 1, 0, newPane)
    return next
  }

  const sourceTabs = source.tabs.filter((tab) => tab !== filename)
  const sourcePane = {
    ...source,
    tabs: sourceTabs,
    activeTab: activeAfterClose(sourceTabs, source.activeTab, filename, tabIndex),
  }
  const newPane: ViewPane = { id: newPaneId, tabs: [filename], activeTab: filename }
  const next = [...panes]
  next.splice(sourceIndex, 1, sourcePane)
  next.splice(side === 'left' ? sourceIndex : sourceIndex + 1, 0, newPane)
  return next.filter((pane) => pane.tabs.length > 0)
}

export function renamePaneTab(panes: ViewPane[], oldFilename: string, newFilename: string): ViewPane[] {
  return panes.map((pane) => ({
    ...pane,
    tabs: pane.tabs.map((filename) => filename === oldFilename ? newFilename : filename),
    activeTab: pane.activeTab === oldFilename ? newFilename : pane.activeTab,
  }))
}

function normalizeFolder(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function isUnderFolder(filename: string, folderPath: string): boolean {
  const folder = normalizeFolder(folderPath)
  return filename === folder || filename.startsWith(`${folder}/`)
}

function replaceFolderPrefix(filename: string, oldFolderPath: string, newFolderPath: string): string {
  const oldFolder = normalizeFolder(oldFolderPath)
  const newFolder = normalizeFolder(newFolderPath)
  if (!isUnderFolder(filename, oldFolder)) return filename
  const suffix = filename.slice(oldFolder.length).replace(/^\/+/, '')
  return newFolder ? `${newFolder}/${suffix}` : suffix
}

export function renamePaneFolder(panes: ViewPane[], oldFolderPath: string, newFolderPath: string): ViewPane[] {
  return panes.map((pane) => ({
    ...pane,
    tabs: pane.tabs.map((filename) => replaceFolderPrefix(filename, oldFolderPath, newFolderPath)),
    activeTab: pane.activeTab
      ? replaceFolderPrefix(pane.activeTab, oldFolderPath, newFolderPath)
      : null,
  }))
}

export function deletePaneFolder(panes: ViewPane[], folderPath: string): ViewPane[] {
  const next = panes
    .map((pane) => {
      const tabs = pane.tabs.filter((filename) => !isUnderFolder(filename, folderPath))
      return {
        ...pane,
        tabs,
        activeTab: pane.activeTab && !isUnderFolder(pane.activeTab, folderPath)
          ? pane.activeTab
          : tabs[tabs.length - 1] ?? null,
      }
    })
    .filter((pane, _index, all) => pane.tabs.length > 0 || all.length === 1)

  return fallbackPane(next)
}
