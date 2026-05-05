import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { A2uiMessage } from '@a2ui/web_core/v0_9'
import { createA2UIViewDocument } from '../a2ui/view'
import { A2UIViewRenderer } from './A2UIViewRenderer'

describe('A2UIViewRenderer', () => {
  it('renders A2UI v0.9 document content and view metadata', async () => {
    const document = {
      ...createA2UIViewDocument('Subscription Flow'),
      facts: [
        { id: 'fact-1', label: 'Subscription route entry point', source: 'src/routes/subscription.ts' },
      ],
    }

    render(
      <A2UIViewRenderer
        document={document}
        versions={[
          { id: 'v2', createdAt: '2026-05-04T16:00:00.000Z', path: '/tmp/v2.json' },
          { id: 'v1', createdAt: '2026-05-04T15:00:00.000Z', path: '/tmp/v1.json' },
        ]}
      />,
    )

    expect(await screen.findByText(/Subscription Flow/)).toBeTruthy()
    expect(screen.getByText('draft')).toBeTruthy()
    expect(screen.getByText((_content, element) => element?.textContent === '2 versions')).toBeTruthy()
    expect(screen.getByText('Based on Facts')).toBeTruthy()
    expect(screen.getByText('Subscription route entry point')).toBeTruthy()
    expect(screen.getByText('Versions')).toBeTruthy()
    expect(screen.getByText('v2')).toBeTruthy()
  })

  it('surfaces A2UI processor errors', async () => {
    const document = {
      ...createA2UIViewDocument('Broken View'),
      a2uiMessages: [
        {
          version: 'v0.9',
          createSurface: {
            surfaceId: 'main',
            catalogId: 'missing-catalog',
          },
        },
      ] as A2uiMessage[],
    }

    render(<A2UIViewRenderer document={document} />)

    expect(await screen.findByText('A2UI render failed')).toBeTruthy()
  })
})
