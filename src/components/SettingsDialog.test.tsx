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
      />,
    )

    expect(screen.getByText('0.1.0')).toBeTruthy()
    expect(screen.getByRole('button', { name: /restart to update/i })).toBeTruthy()
  })
})
