import type { A2uiMessage } from '@a2ui/web_core/v0_9'
import { A2uiMessageListSchema } from '@a2ui/web_core/v0_9'
import { basicCatalog } from '@a2ui/react/v0_9'
import { emptyGraph, isValidA2UIGraph, type A2UIGraph } from './schema'

export type A2UIViewStatus = 'draft' | 'reviewed' | 'confirmed'

export interface A2UIViewFact {
  id: string
  label: string
  source?: string
}

export interface A2UIViewVersionRef {
  id: string
  createdAt: string
  title: string
  status: A2UIViewStatus
}

export interface A2UIViewDocument {
  kind: 'a2ui-view'
  version: 1
  title: string
  status: A2UIViewStatus
  a2uiMessages: A2uiMessage[]
  facts: A2UIViewFact[]
  versions: A2UIViewVersionRef[]
  updatedAt?: string
}

export type ParsedViewDocument =
  | { kind: 'a2ui-view'; document: A2UIViewDocument }
  | { kind: 'legacy-graph'; graph: A2UIGraph }

const VALID_STATUSES = new Set<A2UIViewStatus>(['draft', 'reviewed', 'confirmed'])
export const BASIC_CATALOG_ID = basicCatalog.id

export function defaultA2UIMessages(title: string): A2uiMessage[] {
  const surfaceId = 'main'
  return [
    {
      version: 'v0.9',
      createSurface: {
        surfaceId,
        catalogId: BASIC_CATALOG_ID,
      },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId,
        components: [
          {
            id: 'root',
            component: 'Column',
            children: ['title', 'body'],
            gap: 'medium',
          },
          {
            id: 'title',
            component: 'Text',
            text: title,
            variant: 'h1',
          },
          {
            id: 'body',
            component: 'Text',
            text: 'Ask the Agent to generate or update this View.',
          },
        ],
      },
    },
  ] as A2uiMessage[]
}

export function createA2UIViewDocument(
  title: string,
  messages: A2uiMessage[] = defaultA2UIMessages(title),
): A2UIViewDocument {
  return {
    kind: 'a2ui-view',
    version: 1,
    title,
    status: 'draft',
    a2uiMessages: messages,
    facts: [],
    versions: [],
    updatedAt: new Date().toISOString(),
  }
}

export function parseA2UIViewText(text: string): ParsedViewDocument {
  if (!text.trim()) {
    return { kind: 'a2ui-view', document: createA2UIViewDocument('Untitled') }
  }

  const parsed = JSON.parse(text) as unknown
  if (isA2UIViewDocument(parsed)) {
    const result = A2uiMessageListSchema.safeParse(parsed.a2uiMessages)
    if (!result.success) {
      throw new Error(`Invalid A2UI messages: ${result.error.message}`)
    }
    return { kind: 'a2ui-view', document: parsed }
  }

  const legacy = isValidA2UIGraph(parsed)
  if (legacy.ok) return { kind: 'legacy-graph', graph: parsed as A2UIGraph }

  throw new Error(legacy.reason)
}

export function isA2UIViewDocument(value: unknown): value is A2UIViewDocument {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    v.kind === 'a2ui-view' &&
    v.version === 1 &&
    typeof v.title === 'string' &&
    VALID_STATUSES.has(v.status as A2UIViewStatus) &&
    Array.isArray(v.a2uiMessages) &&
    Array.isArray(v.facts) &&
    Array.isArray(v.versions)
  )
}

export function legacyGraphToViewDocument(graph: A2UIGraph, title = 'Legacy Graph'): A2UIViewDocument {
  if (graph.nodes.length === 0) return createA2UIViewDocument(title)
  const surfaceId = 'main'
  const text = [
    title,
    '',
    ...graph.nodes.map((node) => `- ${node.label}${node.payload?.explanation ? `: ${node.payload.explanation}` : ''}`),
  ].join('\n')

  return createA2UIViewDocument(title, [
    {
      version: 'v0.9',
      createSurface: { surfaceId, catalogId: BASIC_CATALOG_ID },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId,
        components: [
          {
            id: 'root',
            component: 'Text',
            text,
          },
        ],
      },
    },
  ] as A2uiMessage[])
}

export { emptyGraph }
