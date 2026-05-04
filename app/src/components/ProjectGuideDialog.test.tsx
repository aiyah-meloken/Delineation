import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectGuideDialog, type ProjectGuideState } from './ProjectGuideDialog'

function renderGuide(overrides: Partial<ProjectGuideState> = {}) {
  const state: ProjectGuideState = {
    mode: 'initialize',
    path: '/Users/me/not-a-project',
    name: 'not-a-project',
    ...overrides,
  }
  const props = {
    state,
    onNameChange: vi.fn(),
    onChooseFolder: vi.fn(),
    onClose: vi.fn(),
    onCreate: vi.fn(),
    onInitialize: vi.fn(),
    onOpenExisting: vi.fn(),
  }
  return { ...render(<ProjectGuideDialog {...props} />), props }
}

describe('ProjectGuideDialog', () => {
  it('explains when a folder is not a project and initializes it', () => {
    const { props } = renderGuide()

    expect(screen.getByText(/not a Delineation Project/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /initialize project/i }))

    expect(props.onInitialize).toHaveBeenCalledTimes(1)
  })

  it('detects an already-initialized project and opens it instead of creating', () => {
    const { props } = renderGuide({ mode: 'already-project' })

    expect(screen.getByText(/already contains Delineation project settings/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /open project/i }))

    expect(props.onOpenExisting).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText(/project name/i)).toBeNull()
  })

  it('starts new project flow before choosing a folder', () => {
    const { props } = renderGuide({ mode: 'create', path: null, name: '' })

    expect(screen.getByText(/No folder selected/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /create project/i }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /choose folder/i }))

    expect(props.onChooseFolder).toHaveBeenCalledTimes(1)
  })
})
