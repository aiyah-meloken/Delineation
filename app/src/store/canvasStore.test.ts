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
})
