import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from './projectStore'

describe('projectStore', () => {
  beforeEach(() => {
    useProjectStore.getState().reset()
  })

  it('starts with no project, empty view list, no tabs', () => {
    const state = useProjectStore.getState()
    expect(state.currentProject).toBeNull()
    expect(state.viewList).toEqual([])
    expect(state.openTabs).toEqual([])
    expect(state.activeTab).toBeNull()
  })
})

describe('openProject', () => {
  beforeEach(() => {
    useProjectStore.getState().reset()
  })

  it('sets currentProject and viewList (sorted)', () => {
    useProjectStore.getState().openProject('/path/to/proj', ['z.html', 'a.html', 'm.html'])
    const s = useProjectStore.getState()
    expect(s.currentProject).toBe('/path/to/proj')
    expect(s.viewList).toEqual(['a.html', 'm.html', 'z.html'])
  })

  it('clears tabs from a previous project', () => {
    useProjectStore.setState({
      currentProject: '/old',
      viewList: ['old.html'],
      openTabs: ['old.html'],
      activeTab: 'old.html',
    })
    useProjectStore.getState().openProject('/new', ['new.html'])
    const s = useProjectStore.getState()
    expect(s.openTabs).toEqual([])
    expect(s.activeTab).toBeNull()
  })
})

describe('openView', () => {
  beforeEach(() => {
    useProjectStore.getState().reset()
    useProjectStore.getState().openProject('/p', ['a.html', 'b.html', 'c.html'])
  })

  it('opens a new tab and activates it', () => {
    useProjectStore.getState().openView('a.html')
    const s = useProjectStore.getState()
    expect(s.openTabs).toEqual(['a.html'])
    expect(s.activeTab).toBe('a.html')
  })

  it('appends new tabs in click order', () => {
    useProjectStore.getState().openView('b.html')
    useProjectStore.getState().openView('a.html')
    const s = useProjectStore.getState()
    expect(s.openTabs).toEqual(['b.html', 'a.html'])
    expect(s.activeTab).toBe('a.html')
  })

  it('does not duplicate an already-open tab; just activates it', () => {
    useProjectStore.getState().openView('a.html')
    useProjectStore.getState().openView('b.html')
    useProjectStore.getState().openView('a.html')
    const s = useProjectStore.getState()
    expect(s.openTabs).toEqual(['a.html', 'b.html'])
    expect(s.activeTab).toBe('a.html')
  })
})

describe('closeTab', () => {
  beforeEach(() => {
    useProjectStore.getState().reset()
    useProjectStore.getState().openProject('/p', ['a.html', 'b.html', 'c.html'])
    useProjectStore.getState().openView('a.html')
    useProjectStore.getState().openView('b.html')
    useProjectStore.getState().openView('c.html')
    // openTabs = [a, b, c], activeTab = c
  })

  it('removes the tab from openTabs', () => {
    useProjectStore.getState().closeTab('b.html')
    expect(useProjectStore.getState().openTabs).toEqual(['a.html', 'c.html'])
  })

  it('keeps activeTab unchanged when closing a non-active tab', () => {
    useProjectStore.getState().closeTab('a.html')
    expect(useProjectStore.getState().activeTab).toBe('c.html')
  })

  it('activates the right neighbor when closing the active tab', () => {
    useProjectStore.setState({ activeTab: 'a.html' })
    useProjectStore.getState().closeTab('a.html')
    expect(useProjectStore.getState().activeTab).toBe('b.html')
  })

  it('falls back to the left neighbor when closing the rightmost active tab', () => {
    // active is 'c.html' (rightmost) per beforeEach
    useProjectStore.getState().closeTab('c.html')
    expect(useProjectStore.getState().activeTab).toBe('b.html')
  })

  it('sets activeTab to null when closing the only tab', () => {
    useProjectStore.setState({ openTabs: ['only.html'], activeTab: 'only.html' })
    useProjectStore.getState().closeTab('only.html')
    const s = useProjectStore.getState()
    expect(s.openTabs).toEqual([])
    expect(s.activeTab).toBeNull()
  })
})

describe('refreshViewList', () => {
  beforeEach(() => {
    useProjectStore.getState().reset()
    useProjectStore.getState().openProject('/p', ['a.html'])
  })

  it('replaces viewList with sorted new entries; tabs untouched', () => {
    useProjectStore.getState().openView('a.html')
    useProjectStore.getState().refreshViewList(['z.html', 'a.html'])
    const s = useProjectStore.getState()
    expect(s.viewList).toEqual(['a.html', 'z.html'])
    expect(s.openTabs).toEqual(['a.html'])
    expect(s.activeTab).toBe('a.html')
  })
})
