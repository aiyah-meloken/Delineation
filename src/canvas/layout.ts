import dagre from '@dagrejs/dagre'
import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { A2UIGraph } from '../a2ui/schema'

const NODE_WIDTH = 180
const NODE_HEIGHT = 56

export interface StepNodeData extends Record<string, unknown> {
  label: string
  explanation?: string
}

export interface LayoutResult {
  nodes: Node<StepNodeData>[]
  edges: Edge[]
}

export function layoutGraph(graph: A2UIGraph): LayoutResult {
  if (graph.nodes.length === 0) return { nodes: [], edges: [] }

  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const n of graph.nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const e of graph.edges) {
    g.setEdge(e.from, e.to)
  }
  // Treat positionHint.after as an extra edge so dagre orders accordingly.
  for (const n of graph.nodes) {
    if (n.positionHint?.after) g.setEdge(n.positionHint.after, n.id)
  }

  dagre.layout(g)

  const nodes: Node<StepNodeData>[] = graph.nodes.map((n) => {
    const pos = g.node(n.id)
    return {
      id: n.id,
      type: 'step',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: { label: n.label, explanation: n.payload?.explanation },
    }
  })

  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    label: e.label,
    markerEnd: { type: MarkerType.ArrowClosed },
  }))

  return { nodes, edges }
}
