import { describe, expect, it } from 'vitest'
import {
  buildViewTree,
  folderForNewChild,
  moveViewPath,
  type ViewFolderNode,
  type ViewTreeNode,
} from './viewTree'

function asFolder(node: ViewTreeNode): ViewFolderNode {
  if (node.type !== 'folder') throw new Error(`Expected folder, got ${node.type}`)
  return node
}

describe('buildViewTree', () => {
  it('builds nested folders from relative view paths', () => {
    const tree = buildViewTree([
      'overview.html',
      'flows/signup.a2ui.json',
      'flows/subscription/cancel.html',
      'flows/subscription/upgrade.html',
    ])

    expect(tree.children.map((node) => node.name)).toEqual(['flows', 'overview.html'])
    expect(tree.children[0]).toMatchObject({ type: 'folder', name: 'flows', path: 'flows' })
    const flows = asFolder(tree.children[0])
    expect(flows.children.map((node) => node.name)).toEqual([
      'subscription',
      'signup.a2ui.json',
    ])
    expect(flows.children[0]).toMatchObject({
      type: 'folder',
      name: 'subscription',
      path: 'flows/subscription',
    })
  })

  it('sorts folders before files at each level', () => {
    const tree = buildViewTree(['z.html', 'a/note.html', 'b.html'])

    expect(tree.children.map((node) => node.name)).toEqual(['a', 'b.html', 'z.html'])
  })

  it('includes empty folders supplied separately from view files', () => {
    const tree = buildViewTree(['notes.html'], ['empty', 'parent/child'])

    expect(tree.children.map((node) => node.name)).toEqual(['empty', 'parent', 'notes.html'])
    const parent = asFolder(tree.children[1])
    expect(parent).toMatchObject({ type: 'folder', path: 'parent' })
    expect(parent.children[0]).toMatchObject({ type: 'folder', path: 'parent/child' })
  })
})

describe('folderForNewChild', () => {
  it('uses selected folder unchanged', () => {
    expect(folderForNewChild('flows/subscription')).toBe('flows/subscription')
  })

  it('uses parent folder when a file is selected', () => {
    expect(folderForNewChild('flows/subscription/upgrade.html')).toBe('flows/subscription')
  })

  it('uses project root when nothing is selected', () => {
    expect(folderForNewChild(null)).toBe('')
  })
})

describe('moveViewPath', () => {
  it('moves a view into a folder while preserving filename', () => {
    expect(moveViewPath('flows/signup.a2ui.json', 'archive')).toBe('archive/signup.a2ui.json')
  })

  it('moves a nested view back to the project root', () => {
    expect(moveViewPath('flows/subscription/upgrade.html', '')).toBe('upgrade.html')
  })
})
