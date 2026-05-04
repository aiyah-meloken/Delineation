import { describe, expect, it } from 'vitest'
import { isValidA2UIGraph, emptyGraph, type A2UIGraph } from './schema'

describe('isValidA2UIGraph', () => {
  it('accepts a minimal valid graph', () => {
    const g: A2UIGraph = { meta: { version: '0.1', layoutMode: 'flow' }, nodes: [], edges: [] }
    expect(isValidA2UIGraph(g).ok).toBe(true)
  })

  it('rejects wrong version', () => {
    const r = isValidA2UIGraph({ meta: { version: '0.2', layoutMode: 'flow' }, nodes: [], edges: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/version/i)
  })

  it('rejects duplicate node ids', () => {
    const r = isValidA2UIGraph({
      meta: { version: '0.1', layoutMode: 'flow' },
      nodes: [
        { id: 'a', type: 'step', label: 'A' },
        { id: 'a', type: 'step', label: 'A2' },
      ],
      edges: [],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/duplicate/i)
  })

  it('rejects edge with unknown endpoint', () => {
    const r = isValidA2UIGraph({
      meta: { version: '0.1', layoutMode: 'flow' },
      nodes: [{ id: 'a', type: 'step', label: 'A' }],
      edges: [{ id: 'e1', from: 'a', to: 'b' }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/edge/i)
  })

  it('rejects positionHint.after referencing missing node', () => {
    const r = isValidA2UIGraph({
      meta: { version: '0.1', layoutMode: 'flow' },
      nodes: [{ id: 'a', type: 'step', label: 'A', positionHint: { after: 'b' } }],
      edges: [],
    })
    expect(r.ok).toBe(false)
  })

  it('rejects non-object input', () => {
    expect(isValidA2UIGraph(null).ok).toBe(false)
    expect(isValidA2UIGraph('hi').ok).toBe(false)
  })
})

describe('emptyGraph', () => {
  it('returns a valid empty graph', () => {
    const g = emptyGraph()
    expect(isValidA2UIGraph(g).ok).toBe(true)
    expect(g.nodes).toEqual([])
    expect(g.edges).toEqual([])
  })
})
