import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('exposes separate new and open project actions', () => {
    const onNewProject = vi.fn()
    const onOpenProject = vi.fn()

    render(
      <EmptyState
        onNewProject={onNewProject}
        onOpenProject={onOpenProject}
        onOpenSample={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /new project/i }))
    fireEvent.click(screen.getByRole('button', { name: /open project/i }))

    expect(onNewProject).toHaveBeenCalledTimes(1)
    expect(onOpenProject).toHaveBeenCalledTimes(1)
  })
})
