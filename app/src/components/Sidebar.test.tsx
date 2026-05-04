import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const props: Parameters<typeof Sidebar>[0] = {
    projectName: 'Sample Project',
    views: ['overview.html', 'flows/signup.a2ui.json'],
    folders: ['flows', 'archive'],
    activeView: null,
    selectedFolder: '',
    onSelect: vi.fn(),
    onSelectFolder: vi.fn(),
    onOpenProject: vi.fn(),
    onNewProject: vi.fn(),
    onNewFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteView: vi.fn(),
    onRenameView: vi.fn(),
    onMoveView: vi.fn(),
    onNewCanvas: vi.fn(),
    onOpenSettings: vi.fn(),
    updateReady: false,
    ...overrides,
  }

  return { ...render(<Sidebar {...props} />), props }
}

function mockElementFromPoint(element: Element) {
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => element),
  })
  return document.elementFromPoint as ReturnType<typeof vi.fn>
}

describe('Sidebar project actions', () => {
  it('has separate new and open project buttons', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: /new project/i }))
    fireEvent.click(screen.getByRole('button', { name: /^open project$/i }))

    expect(props.onNewProject).toHaveBeenCalledTimes(1)
    expect(props.onOpenProject).toHaveBeenCalledTimes(1)
  })
})

describe('Sidebar drag and drop', () => {
  it('moves a view into a folder with pointer dragging', () => {
    const { props } = renderSidebar()
    const archive = screen.getByText('archive').closest('li')
    const overview = screen.getByText('overview').closest('li')
    if (!archive || !overview) throw new Error('Expected tree rows')

    const elementFromPoint = mockElementFromPoint(archive)

    fireEvent.pointerDown(overview, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 24, clientY: 44 })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 24, clientY: 44 })
    fireEvent.click(overview)

    expect(props.onMoveView).toHaveBeenCalledWith('overview.html', 'archive')
    expect(props.onSelect).not.toHaveBeenCalled()
    elementFromPoint.mockClear()
  })

  it('highlights the whole target folder group while dragging over a folder', () => {
    renderSidebar()
    const archive = screen.getByText('archive').closest('li')
    const overview = screen.getByText('overview').closest('li')
    if (!archive || !overview) throw new Error('Expected tree rows')
    mockElementFromPoint(archive)

    fireEvent.pointerDown(overview, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 24, clientY: 44 })

    expect(archive.closest('[data-folder-group]')?.className).toContain('drop-within')
    expect(archive.className).not.toContain('drop-target')
  })

  it('marks the dragged view row without inserting a project-root row', () => {
    renderSidebar()
    const overview = screen.getByText('overview').closest('li')
    if (!overview) throw new Error('Expected tree row')

    fireEvent.pointerDown(overview, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 28, clientY: 44 })

    expect(screen.queryByText('Move to Project Root')).toBeNull()
    expect(overview.className).toContain('dragging')
  })

  it('prevents browser text selection when starting a view drag', () => {
    renderSidebar()
    const overview = screen.getByText('overview').closest('li')
    if (!overview) throw new Error('Expected tree row')

    const event = new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 20,
      clientY: 20,
    })
    overview.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('moves a view to project root with pointer dragging', () => {
    const { props } = renderSidebar()
    const signup = screen.getByText('signup').closest('li')
    if (!signup) throw new Error('Expected tree row')
    const root = signup.closest('ul')
    if (!root) throw new Error('Expected root list')

    fireEvent.pointerDown(signup, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 24, clientY: 44 })
    const elementFromPoint = mockElementFromPoint(root)

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 24, clientY: 44 })

    expect(props.onMoveView).toHaveBeenCalledWith('flows/signup.a2ui.json', '')
    elementFromPoint.mockClear()
  })
})

describe('Sidebar folder management', () => {
  it('collapses and expands a folder', () => {
    renderSidebar()

    fireEvent.click(screen.getByLabelText('Collapse flows'))
    expect(screen.queryByText('signup')).toBeNull()

    fireEvent.click(screen.getByLabelText('Expand flows'))
    expect(screen.getByText('signup')).toBeTruthy()
  })

  it('renames a folder from the context menu', () => {
    const { props } = renderSidebar()

    fireEvent.contextMenu(screen.getByText('archive'))
    fireEvent.click(screen.getByText('Rename Folder'))
    const input = screen.getByDisplayValue('archive')
    fireEvent.change(input, { target: { value: 'old views' } })
    fireEvent.blur(input)

    expect(props.onRenameFolder).toHaveBeenCalledWith('archive', 'old views')
  })

  it('deletes a folder from the context menu', () => {
    const { props } = renderSidebar()

    fireEvent.contextMenu(screen.getByText('archive'))
    fireEvent.click(screen.getByText('Delete Folder'))

    expect(props.onDeleteFolder).toHaveBeenCalledWith('archive')
  })
})
