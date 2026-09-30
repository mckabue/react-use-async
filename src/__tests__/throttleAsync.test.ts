import {
  describe,
  beforeEach,
  jest,
  afterEach,
  it,
  expect,
} from '@jest/globals'
import { throttleAsync } from '../throttleAsync'

describe('throttleAsync', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('runs the first call immediately', async () => {
    const fn = jest.fn(async (n: number) => n * 2)
    const throttled = throttleAsync(fn, 1_000)

    await expect(throttled(2)).resolves.toBe(4)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('shares the in-flight run with concurrent callers', async () => {
    let resolveRun: (value: string) => void = () => {}
    const fn = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveRun = resolve
        }),
    )
    const throttled = throttleAsync(fn, 1_000)

    const first = throttled()
    const second = throttled()

    expect(fn).toHaveBeenCalledTimes(1)
    resolveRun('done')
    await expect(first).resolves.toBe('done')
    await expect(second).resolves.toBe('done')
  })

  it('drops a call inside the window, resolving it to undefined', async () => {
    const fn = jest.fn(async () => 'ran')
    const throttled = throttleAsync(fn, 1_000)

    await expect(throttled()).resolves.toBe('ran')

    jest.advanceTimersByTime(999)
    await expect(throttled()).resolves.toBeUndefined()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('runs again once the window has passed', async () => {
    const fn = jest.fn(async () => 'ran')
    const throttled = throttleAsync(fn, 1_000)

    await throttled()

    jest.advanceTimersByTime(1_000)
    await expect(throttled()).resolves.toBe('ran')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('rejects instead of throwing when func throws synchronously', async () => {
    const throttled = throttleAsync(() => {
      throw new Error('sync boom')
    }, 1_000)

    await expect(throttled()).rejects.toThrow('sync boom')
  })

  it('propagates a rejection and re-opens the window', async () => {
    const fn = jest.fn(async () => {
      throw new Error('async boom')
    })
    const throttled = throttleAsync(fn, 1_000)

    await expect(throttled()).rejects.toThrow('async boom')

    jest.advanceTimersByTime(1_000)
    await expect(throttled()).rejects.toThrow('async boom')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
