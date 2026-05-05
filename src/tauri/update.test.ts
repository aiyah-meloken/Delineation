import { describe, expect, it, vi } from 'vitest'
import {
  AUTO_UPDATE_CHECK_INTERVAL_MS,
  startUpdateCheckLoop,
  type UpdateState,
} from './update'

describe('startUpdateCheckLoop', () => {
  it('checks immediately, schedules one-minute checks, and logs state transitions', async () => {
    let intervalCallback: (() => void) | undefined
    const setIntervalFn = vi.fn((callback: () => void, _ms: number) => {
      intervalCallback = callback
      return 42
    })
    const clearIntervalFn = vi.fn()
    const logger = { info: vi.fn(), error: vi.fn() }
    const states: UpdateState[] = []
    const check = vi.fn(async (onState: (state: UpdateState) => void) => {
      onState({ phase: 'up-to-date', message: 'Delineation is up to date.' })
      return null
    })

    const stop = startUpdateCheckLoop({
      check,
      onState: (state) => states.push(state),
      onUpdateReady: vi.fn(),
      logger,
      setIntervalFn,
      clearIntervalFn,
    })
    await Promise.resolve()

    expect(check).toHaveBeenCalledTimes(1)
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), AUTO_UPDATE_CHECK_INTERVAL_MS)
    expect(states[0]).toMatchObject({ phase: 'up-to-date' })
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('startup'))
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('up-to-date'))

    const tick = intervalCallback
    expect(tick).toBeDefined()
    tick?.()
    await Promise.resolve()

    expect(check).toHaveBeenCalledTimes(2)
    stop()
    expect(clearIntervalFn).toHaveBeenCalledWith(42)
  })
})
