import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TabStrip } from './TabStrip'

function renderTabs() {
  const props = {
    paneId: 'pane-1',
    tabs: ['a.html', 'b.html', 'c.html'],
    activeTab: 'a.html',
    onActivate: vi.fn(),
    onClose: vi.fn(),
    onReorder: vi.fn(),
  }
  return { ...render(<TabStrip {...props} />), props }
}

function mockElementFromPoint(element: Element) {
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => element),
  })
}

describe('TabStrip', () => {
  it('prevents text selection when starting a tab drag', () => {
    renderTabs()
    const tab = screen.getByText('a').closest('[data-tab-name]')
    if (!tab) throw new Error('Expected tab')

    const event = new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 20,
      clientY: 10,
    })
    tab.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('reorders tabs with pointer dragging', () => {
    const { props } = renderTabs()
    const dragged = screen.getByText('c').closest('[data-tab-name]')
    const target = screen.getByText('a').closest('[data-tab-name]')
    if (!dragged || !target) throw new Error('Expected tabs')
    mockElementFromPoint(target)

    fireEvent.pointerDown(dragged, { button: 0, clientX: 200, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 20, clientY: 10 })
    fireEvent.pointerUp(window, { clientX: 20, clientY: 10 })
    fireEvent.click(dragged)

    expect(props.onReorder).toHaveBeenCalledWith('c.html', 'a.html')
    expect(props.onActivate).not.toHaveBeenCalled()
  })

  it('shows a floating drag preview while dragging a tab', () => {
    renderTabs()
    const dragged = screen.getByText('c').closest('[data-tab-name]')
    if (!dragged) throw new Error('Expected tab')
    mockElementFromPoint(dragged)

    fireEvent.pointerDown(dragged, { button: 0, clientX: 200, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 240, clientY: 35 })

    const ghost = document.querySelector('.tab-drag-ghost')
    expect(ghost).not.toBeNull()
    expect(ghost?.textContent).toContain('c')
  })

})
