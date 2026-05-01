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
