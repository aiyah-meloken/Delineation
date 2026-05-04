export type ViewTreeNode = ViewFolderNode | ViewFileNode

export interface ViewFolderNode {
  type: 'folder'
  name: string
  path: string
  children: ViewTreeNode[]
}

export interface ViewFileNode {
  type: 'file'
  name: string
  path: string
}

export interface ViewTreeRoot {
  type: 'root'
  name: ''
  path: ''
  children: ViewTreeNode[]
}

function sortNodes(a: ViewTreeNode, b: ViewTreeNode): number {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
  return a.name.localeCompare(b.name)
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function ensureFolder(parent: ViewFolderNode | ViewTreeRoot, name: string, path: string): ViewFolderNode {
  const existing = parent.children.find(
    (node): node is ViewFolderNode => node.type === 'folder' && node.name === name,
  )
  if (existing) return existing

  const folder: ViewFolderNode = { type: 'folder', name, path, children: [] }
  parent.children.push(folder)
  return folder
}

function addFolderPath(root: ViewTreeRoot, folderPath: string) {
  const path = normalizeRelativePath(folderPath)
  if (!path) return

  const parts = path.split('/').filter(Boolean)
  let parent: ViewFolderNode | ViewTreeRoot = root
  let currentPath = ''

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part
    parent = ensureFolder(parent, part, currentPath)
  }
}

export function buildViewTree(paths: string[], folderPaths: string[] = []): ViewTreeRoot {
  const root: ViewTreeRoot = { type: 'root', name: '', path: '', children: [] }

  for (const folderPath of folderPaths) {
    addFolderPath(root, folderPath)
  }

  for (const rawPath of paths) {
    const path = normalizeRelativePath(rawPath)
    if (!path) continue

    const parts = path.split('/').filter(Boolean)
    let parent: ViewFolderNode | ViewTreeRoot = root
    let currentPath = ''

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]
      currentPath = currentPath ? `${currentPath}/${part}` : part

      if (i === parts.length - 1) {
        parent.children.push({ type: 'file', name: part, path: currentPath })
      } else {
        parent = ensureFolder(parent, part, currentPath)
      }
    }
  }

  const sortRecursive = (node: ViewFolderNode | ViewTreeRoot) => {
    node.children.sort(sortNodes)
    for (const child of node.children) {
      if (child.type === 'folder') sortRecursive(child)
    }
  }

  sortRecursive(root)
  return root
}

export function folderForNewChild(selection: string | null): string {
  if (!selection) return ''
  const normalized = normalizeRelativePath(selection)
  if (!normalized.includes('.')) return normalized
  const slash = normalized.lastIndexOf('/')
  return slash === -1 ? '' : normalized.slice(0, slash)
}

export function moveViewPath(viewPath: string, targetFolderPath: string): string {
  const normalizedView = normalizeRelativePath(viewPath)
  const normalizedFolder = normalizeRelativePath(targetFolderPath)
  const filename = normalizedView.split('/').filter(Boolean).pop() ?? normalizedView
  return normalizedFolder ? `${normalizedFolder}/${filename}` : filename
}
