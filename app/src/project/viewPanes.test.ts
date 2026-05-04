import { describe, expect, it } from 'vitest'
import {
  closePaneTab,
  openPaneTab,
  renamePaneFolder,
  renamePaneTab,
  reorderPaneTab,
  splitPaneTab,
  type ViewPane,
} from './viewPanes'

const pane = (id: string, tabs: string[], activeTab: string | null = tabs[0] ?? null): ViewPane => ({
  id,
  tabs,
  activeTab,
})

describe('viewPanes', () => {
  it('opens a tab in the active pane and focuses an existing tab where it already lives', () => {
    const panes = [pane('left', ['a.html']), pane('right', ['b.html'])]

    expect(openPaneTab(panes, 'right', 'c.html')).toEqual([
      pane('left', ['a.html']),
      pane('right', ['b.html', 'c.html'], 'c.html'),
    ])

    expect(openPaneTab(panes, 'right', 'a.html')).toEqual([
      pane('left', ['a.html'], 'a.html'),
      pane('right', ['b.html']),
    ])
  })

  it('closes a tab and keeps a usable empty pane when the last tab closes', () => {
    expect(closePaneTab([pane('left', ['a.html', 'b.html'], 'a.html')], 'a.html')).toEqual([
      pane('left', ['b.html'], 'b.html'),
    ])

    expect(closePaneTab([pane('left', ['a.html'])], 'a.html')).toEqual([
      pane('left', [], null),
    ])
  })

  it('closes only the requested pane copy when the same tab is split twice', () => {
    expect(closePaneTab([
      pane('left', ['a.html']),
      pane('right', ['a.html']),
    ], 'a.html', 'right')).toEqual([
      pane('left', ['a.html']),
    ])
  })

  it('reorders a tab inside one pane only', () => {
    expect(reorderPaneTab([pane('left', ['a.html', 'b.html', 'c.html'])], 'left', 'c.html', 'a.html')).toEqual([
      pane('left', ['c.html', 'a.html', 'b.html'], 'a.html'),
    ])
  })

  it('splits a dragged tab into a neighboring pane', () => {
    expect(splitPaneTab([pane('left', ['a.html', 'b.html'], 'a.html')], 'left', 'b.html', 'right', 'right')).toEqual([
      pane('left', ['a.html'], 'a.html'),
      pane('right', ['b.html'], 'b.html'),
    ])

    expect(splitPaneTab([pane('main', ['a.html', 'b.html'], 'b.html')], 'main', 'b.html', 'left', 'new-left')).toEqual([
      pane('new-left', ['b.html'], 'b.html'),
      pane('main', ['a.html'], 'a.html'),
    ])
  })

  it('duplicates the only tab when splitting a single-tab pane', () => {
    expect(splitPaneTab([pane('main', ['a.html'])], 'main', 'a.html', 'right', 'new-right')).toEqual([
      pane('main', ['a.html'], 'a.html'),
      pane('new-right', ['a.html'], 'a.html'),
    ])
  })

  it('renames tab paths across panes', () => {
    const panes = [pane('left', ['docs/a.html']), pane('right', ['docs/b.a2ui.json'])]

    expect(renamePaneTab(panes, 'docs/a.html', 'notes/a.html')).toEqual([
      pane('left', ['notes/a.html'], 'notes/a.html'),
      pane('right', ['docs/b.a2ui.json']),
    ])

    expect(renamePaneFolder(panes, 'docs', 'archive/docs')).toEqual([
      pane('left', ['archive/docs/a.html'], 'archive/docs/a.html'),
      pane('right', ['archive/docs/b.a2ui.json'], 'archive/docs/b.a2ui.json'),
    ])
  })
})
