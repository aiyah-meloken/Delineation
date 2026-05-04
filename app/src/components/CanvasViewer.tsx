import { useMemo } from 'react'
import { ReactFlow, Background, Controls, MiniMap, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { A2UIGraph } from '../a2ui/schema'
import { layoutGraph } from '../canvas/layout'
import { StepNode } from './StepNode'

const nodeTypes: NodeTypes = { step: StepNode as unknown as NodeTypes[string] }

interface Props {
  graph: A2UIGraph | null
  parseError?: string | null
}

export function CanvasViewer({ graph, parseError }: Props) {
  const { nodes, edges } = useMemo(
    () => (graph ? layoutGraph(graph) : { nodes: [], edges: [] }),
    [graph],
  )

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="canvas-empty">
        <div className="empty-card">
          <h2>Empty A2UI View</h2>
          <p>{parseError ?? 'Use the Agent TUI below to generate or update this View.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="canvas-host">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        fitView
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  )
}
