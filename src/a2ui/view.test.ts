import { describe, expect, it } from 'vitest'
import type { A2uiMessage } from '@a2ui/web_core/v0_9'
import {
  BASIC_CATALOG_ID,
  createA2UIViewDocument,
  defaultA2UIMessages,
  legacyGraphToViewDocument,
  parseA2UIViewText,
} from './view'
import type { A2UIGraph } from './schema'

describe('A2UI View document', () => {
  it('creates a v1 a2ui-view document with default status and messages', () => {
    const doc = createA2UIViewDocument('Subscription Flow')

    expect(doc).toMatchObject({
      kind: 'a2ui-view',
      version: 1,
      title: 'Subscription Flow',
      status: 'draft',
      facts: [],
      versions: [],
    })
    expect(doc.a2uiMessages[0]).toMatchObject({
      version: 'v0.9',
      createSurface: { surfaceId: 'main', catalogId: BASIC_CATALOG_ID },
    })
  })

  it('parses a valid a2ui-view document and validates A2UI messages', () => {
    const doc = createA2UIViewDocument('Architecture')
    const parsed = parseA2UIViewText(JSON.stringify(doc))

    expect(parsed.kind).toBe('a2ui-view')
    if (parsed.kind === 'a2ui-view') {
      expect(parsed.document.title).toBe('Architecture')
      expect(parsed.document.a2uiMessages).toHaveLength(2)
    }
  })

  it('rejects malformed A2UI messages inside an a2ui-view document', () => {
    const doc = {
      ...createA2UIViewDocument('Bad'),
      a2uiMessages: [{ version: 'v0.9', unknown: {} }] as unknown as A2uiMessage[],
    }

    expect(() => parseA2UIViewText(JSON.stringify(doc))).toThrow(/invalid a2ui messages/i)
  })

  it('returns legacy graph documents as a compatibility fallback', () => {
    const graph: A2UIGraph = {
      meta: { version: '0.1', layoutMode: 'flow' },
      nodes: [{ id: 'a', type: 'step', label: 'Read config' }],
      edges: [],
    }

    const parsed = parseA2UIViewText(JSON.stringify(graph))

    expect(parsed.kind).toBe('legacy-graph')
    if (parsed.kind === 'legacy-graph') expect(parsed.graph.nodes[0].label).toBe('Read config')
  })

  it('can convert a legacy graph into renderable A2UI messages', () => {
    const graph: A2UIGraph = {
      meta: { version: '0.1', layoutMode: 'flow' },
      nodes: [
        { id: 'a', type: 'step', label: 'Load user', payload: { explanation: 'Reads users table' } },
      ],
      edges: [],
    }

    const doc = legacyGraphToViewDocument(graph, 'Legacy')

    expect(doc.kind).toBe('a2ui-view')
    expect(JSON.stringify(doc.a2uiMessages)).toContain('Load user')
  })

  it('default messages are accepted by the parser', () => {
    const messages = defaultA2UIMessages('Quick View')
    const doc = createA2UIViewDocument('Quick View', messages)

    expect(() => parseA2UIViewText(JSON.stringify(doc))).not.toThrow()
  })

  it('rejects basic catalog components with invalid v0.9 props', () => {
    const doc = createA2UIViewDocument('Invalid Card', [
      {
        version: 'v0.9',
        createSurface: { surfaceId: 'main', catalogId: BASIC_CATALOG_ID },
      },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'main',
          components: [
            { id: 'root', component: 'Column', children: ['card'] },
            { id: 'card', component: 'Card', children: ['title', 'body'] },
            { id: 'title', component: 'Text', text: 'Title' },
            { id: 'body', component: 'Text', text: 'Body' },
          ],
        },
      },
    ] as A2uiMessage[])

    expect(() => parseA2UIViewText(JSON.stringify(doc))).toThrow(/invalid a2ui component "card" \(Card\).*child/i)
  })

  it('accepts a card that wraps multiple children in a column child', () => {
    const doc = createA2UIViewDocument('Valid Card', [
      {
        version: 'v0.9',
        createSurface: { surfaceId: 'main', catalogId: BASIC_CATALOG_ID },
      },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'main',
          components: [
            { id: 'root', component: 'Column', children: ['card'] },
            { id: 'card', component: 'Card', child: 'card-content' },
            { id: 'card-content', component: 'Column', children: ['title', 'body'] },
            { id: 'title', component: 'Text', text: 'Title' },
            { id: 'body', component: 'Text', text: 'Body' },
          ],
        },
      },
    ] as A2uiMessage[])

    expect(() => parseA2UIViewText(JSON.stringify(doc))).not.toThrow()
  })
})
