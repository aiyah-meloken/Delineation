import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsDialog } from './SettingsDialog'

describe('SettingsDialog', () => {
  it('shows version and restart button only when an update is ready', () => {
    render(
      <SettingsDialog
        appInfo={{ name: 'Delineation', version: '0.1.0' }}
        updateState={{
          phase: 'ready',
          message: 'Version 0.2.0 is ready to install.',
          currentVersion: '0.1.0',
          nextVersion: '0.2.0',
        }}
        onClose={vi.fn()}
        onRestartToUpdate={vi.fn()}
        onOpenInspector={vi.fn()}
        lensKits={[{
          id: 'system',
          name: 'System A2UI Orientation',
          version: '0.1.0',
          description: 'Built-in LensKit',
          path: '/project/.delineation/lenskits/system',
          hasOperator: true,
          hasRenderer: true,
          hasWatcher: true,
          operatorFiles: ['CODEX.md'],
          rendererFiles: ['basic-catalog.json'],
          watcherFiles: ['README.md'],
        }]}
      />,
    )

    expect(screen.getAllByText('0.1.0').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('System A2UI Orientation')).toBeTruthy()
    expect(screen.getByText('operator')).toBeTruthy()
    expect(screen.getByRole('button', { name: /restart to update/i })).toBeTruthy()
  })
})
