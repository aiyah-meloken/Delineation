import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { StepNodeData } from '../canvas/layout'

export function StepNode({ data, selected }: NodeProps & { data: StepNodeData }) {
  return (
    <div className={`step-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="step-label">{data.label}</div>
      {data.explanation && <div className="step-expl">{data.explanation}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
