import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore } from './canvasStore'
import { emptyGraph, type A2UIGraph } from '../a2ui/schema'

const sample: A2UIGraph = {
  meta: { version: '0.1', layoutMode: 'flow' },
  nodes: [{ id: 'a', type: 'step', label: 'A' }],
  edges: [],
}

describe('canvasStore', () => {
  beforeEach(() => useCanvasStore.getState().reset())

  it('returns null graph for unknown filename', () => {
    expect(useCanvasStore.getState().getGraph('x.a2ui.json')).toBeNull()
  })

  it('setGraph stores per filename', () => {
    useCanvasStore.getState().setGraph('a.a2ui.json', sample)
    expect(useCanvasStore.getState().getGraph('a.a2ui.json')).toEqual(sample)
    expect(useCanvasStore.getState().getGraph('b.a2ui.json')).toBeNull()
  })

  it('setGraph replaces and accepts emptyGraph', () => {
    const f = 'a.a2ui.json'
    useCanvasStore.getState().setGraph(f, sample)
    useCanvasStore.getState().setGraph(f, emptyGraph())
    expect(useCanvasStore.getState().getGraph(f)?.nodes).toEqual([])
  })

  it('discard removes the entry', () => {
    const f = 'a.a2ui.json'
    useCanvasStore.getState().setGraph(f, sample)
    useCanvasStore.getState().discard(f)
    expect(useCanvasStore.getState().getGraph(f)).toBeNull()
  })

  it('rename moves a cached graph to the new filename', () => {
    useCanvasStore.getState().setGraph('old.a2ui.json', sample)
    useCanvasStore.getState().rename('old.a2ui.json', 'new.a2ui.json')

    expect(useCanvasStore.getState().getGraph('old.a2ui.json')).toBeNull()
    expect(useCanvasStore.getState().getGraph('new.a2ui.json')).toEqual(sample)
  })

  it('renamePrefix moves cached graphs under a folder', () => {
    useCanvasStore.getState().setGraph('flows/a.a2ui.json', sample)
    useCanvasStore.getState().renamePrefix('flows', 'archive')

    expect(useCanvasStore.getState().getGraph('flows/a.a2ui.json')).toBeNull()
    expect(useCanvasStore.getState().getGraph('archive/a.a2ui.json')).toEqual(sample)
  })

  it('discardPrefix removes cached graphs under a folder', () => {
    useCanvasStore.getState().setGraph('flows/a.a2ui.json', sample)
    useCanvasStore.getState().setGraph('other.a2ui.json', sample)
    useCanvasStore.getState().discardPrefix('flows')

    expect(useCanvasStore.getState().getGraph('flows/a.a2ui.json')).toBeNull()
    expect(useCanvasStore.getState().getGraph('other.a2ui.json')).toEqual(sample)
  })
})
