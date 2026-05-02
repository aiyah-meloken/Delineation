export interface A2UIGraph {
  meta: { version: '0.1'; layoutMode: 'flow' }
  nodes: A2UINode[]
  edges: A2UIEdge[]
}

export interface A2UINode {
  id: string
  type: 'step'
  label: string
  payload?: {
    explanation?: string
    codeRef?: { path: string; range: [number, number] }
  }
  positionHint?: { after?: string }
}

export interface A2UIEdge {
  id: string
  from: string
  to: string
  label?: string
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string }

export function emptyGraph(): A2UIGraph {
  return { meta: { version: '0.1', layoutMode: 'flow' }, nodes: [], edges: [] }
}

export function isValidA2UIGraph(value: unknown): ValidationResult {
  if (typeof value !== 'object' || value === null) return { ok: false, reason: 'not an object' }
  const v = value as Record<string, unknown>

  const meta = v.meta as Record<string, unknown> | undefined
  if (!meta || meta.version !== '0.1') return { ok: false, reason: 'unsupported version (expected 0.1)' }
  if (meta.layoutMode !== 'flow') return { ok: false, reason: 'unsupported layoutMode (expected flow)' }

  if (!Array.isArray(v.nodes)) return { ok: false, reason: 'nodes must be an array' }
  if (!Array.isArray(v.edges)) return { ok: false, reason: 'edges must be an array' }

  const nodeIds = new Set<string>()
  for (const n of v.nodes as Array<Record<string, unknown>>) {
    if (typeof n.id !== 'string' || !n.id) return { ok: false, reason: 'node missing id' }
    if (n.type !== 'step') return { ok: false, reason: `unknown node type ${String(n.type)}` }
    if (typeof n.label !== 'string') return { ok: false, reason: `node ${n.id} missing label` }
    if (nodeIds.has(n.id)) return { ok: false, reason: `duplicate node id ${n.id}` }
    nodeIds.add(n.id)
  }

  // Check positionHint references after node ids are collected
  for (const n of v.nodes as Array<Record<string, unknown>>) {
    const hint = n.positionHint as Record<string, unknown> | undefined
    if (hint?.after !== undefined) {
      if (typeof hint.after !== 'string' || !nodeIds.has(hint.after)) {
        return { ok: false, reason: `node ${n.id} positionHint.after references unknown node ${String(hint.after)}` }
      }
    }
  }

  for (const e of v.edges as Array<Record<string, unknown>>) {
    if (typeof e.id !== 'string' || !e.id) return { ok: false, reason: 'edge missing id' }
    if (typeof e.from !== 'string' || !nodeIds.has(e.from)) return { ok: false, reason: `edge ${e.id} references unknown from ${String(e.from)}` }
    if (typeof e.to !== 'string' || !nodeIds.has(e.to)) return { ok: false, reason: `edge ${e.id} references unknown to ${String(e.to)}` }
  }

  return { ok: true }
}
