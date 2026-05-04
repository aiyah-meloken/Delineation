import { describe, expect, it } from 'vitest'
import { layoutGraph } from './layout'
import type { A2UIGraph } from '../a2ui/schema'

const graph: A2UIGraph = {
  meta: { version: '0.1', layoutMode: 'flow' },
  nodes: [
    { id: 'a', type: 'step', label: 'A' },
    { id: 'b', type: 'step', label: 'B' },
  ],
  edges: [{ id: 'e1', from: 'a', to: 'b' }],
}

describe('layoutGraph', () => {
  it('produces one ReactFlow node per A2UI node with x/y positions', () => {
    const { nodes } = layoutGraph(graph)
    expect(nodes).toHaveLength(2)
    expect(nodes[0].id).toBe('a')
    expect(nodes[0].position.x).toBeTypeOf('number')
    expect(nodes[0].position.y).toBeTypeOf('number')
    expect(nodes[0].data.label).toBe('A')
    expect(nodes[0].type).toBe('step')
  })

  it('positions nodes top-down (b below a)', () => {
    const { nodes } = layoutGraph(graph)
    const a = nodes.find((n) => n.id === 'a')!
    const b = nodes.find((n) => n.id === 'b')!
    expect(b.position.y).toBeGreaterThan(a.position.y)
  })

  it('produces ReactFlow edges with marker', () => {
    const { edges } = layoutGraph(graph)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ id: 'e1', source: 'a', target: 'b' })
    expect(edges[0].markerEnd).toBeDefined()
  })

  it('handles empty graphs', () => {
    const empty: A2UIGraph = { meta: { version: '0.1', layoutMode: 'flow' }, nodes: [], edges: [] }
    const { nodes, edges } = layoutGraph(empty)
    expect(nodes).toEqual([])
    expect(edges).toEqual([])
  })

  it('passes edge label through', () => {
    const g: A2UIGraph = { ...graph, edges: [{ id: 'e1', from: 'a', to: 'b', label: 'next' }] }
    const { edges } = layoutGraph(g)
    expect(edges[0].label).toBe('next')
  })
})
