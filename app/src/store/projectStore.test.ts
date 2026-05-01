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
