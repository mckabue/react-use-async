import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { debounceAsync } from '../debounceAsync'

describe('debounceAsync', () => {
  afterEach(() => void jest.useRealTimers())

  it('coalesces rapid calls into one run with the latest args, resolving every caller', async () => {
    jest.useFakeTimers()
    const func = jest.fn<(...args: [number]) => Promise<string>>(async (n) => `n=${n}`)
    const debounced = debounceAsync(func, 100)

    const p1 = debounced(1)
    const p2 = debounced(2)
    const p3 = debounced(3)

    jest.advanceTimersByTime(99)
    expect(func).not.toHaveBeenCalled()

    jest.advanceTimersByTime(1)
    await Promise.resolve()

    expect(func).toHaveBeenCalledTimes(1)
    expect(func).toHaveBeenLastCalledWith(3)
    await expect(p1).resolves.toBe('n=3')
    await expect(p2).resolves.toBe('n=3')
    await expect(p3).resolves.toBe('n=3')
  })

  it('slides the window on every call, firing wait ms after the last one', async () => {
    jest.useFakeTimers()
    const func = jest.fn<() => Promise<void>>(async () => {})
    const debounced = debounceAsync(func, 100)

    debounced()                    // would fire at t=100
    jest.advanceTimersByTime(50)
    debounced()                    // rescheduled to t=150
    jest.advanceTimersByTime(50)
    debounced()                    // rescheduled to t=200
    jest.advanceTimersByTime(50)
    expect(func).not.toHaveBeenCalled() // t=150 < 200

    jest.advanceTimersByTime(50)   // t=200 → fires
    await Promise.resolve()
    expect(func).toHaveBeenCalledTimes(1)
  })

  it('starts a fresh window after firing', async () => {
    jest.useFakeTimers()
    const func = jest.fn<() => Promise<number>>(async () => 42)
    const debounced = debounceAsync(func, 100)

    const first = debounced()
    jest.advanceTimersByTime(100)
    await Promise.resolve()
    await expect(first).resolves.toBe(42)
    expect(func).toHaveBeenCalledTimes(1)

    const second = debounced()
    jest.advanceTimersByTime(100)
    await Promise.resolve()
    await expect(second).resolves.toBe(42)
    expect(func).toHaveBeenCalledTimes(2)
  })

  it('propagates a rejection to every waiter', async () => {
    jest.useFakeTimers()
    const boom = new Error('boom')
    const func = jest.fn<() => Promise<void>>().mockRejectedValueOnce(boom)
    const debounced = debounceAsync(func, 100)

    const p1 = debounced()
    const p2 = debounced()
    const seen: unknown[] = []
    p1.catch((e) => { seen.push(e) })
    p2.catch((e) => { seen.push(e) })

    jest.advanceTimersByTime(100)
    await Promise.resolve()
    await Promise.resolve()

    expect(func).toHaveBeenCalledTimes(1)
    expect(seen).toEqual([boom, boom])
  })

  it('rejects waiters when func throws synchronously instead of hanging', async () => {
    jest.useFakeTimers()
    const boom = new Error('sync boom')
    // A `never`-returning sync thrower is assignable to `() => Promise<R>`.
    const func = jest.fn<() => Promise<void>>(() => { throw boom })
    const debounced = debounceAsync(func, 100)

    const p = debounced()
    const seen: unknown[] = []
    p.catch((e) => { seen.push(e) })

    jest.advanceTimersByTime(100)
    await Promise.resolve()
    await Promise.resolve()

    expect(func).toHaveBeenCalledTimes(1)
    expect(seen).toEqual([boom])
  })

  it('a call made while a run is in-flight starts a fresh window', async () => {
    jest.useFakeTimers()
    const resolvers: Array<() => void> = []
    const func = jest.fn<() => Promise<void>>(
      () => new Promise<void>((resolve) => { resolvers.push(() => resolve()) }),
    )
    const debounced = debounceAsync(func, 100)

    const first = debounced()
    jest.advanceTimersByTime(100)
    await Promise.resolve()
    expect(func).toHaveBeenCalledTimes(1)

    const second = debounced()    // func still in-flight → fresh window
    jest.advanceTimersByTime(100)
    expect(func).toHaveBeenCalledTimes(2)

    resolvers.forEach((release) => release())
    await Promise.resolve()
    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBeUndefined()
  })

  it('cancel drops a pending call and rejects waiters with AbortError', async () => {
    jest.useFakeTimers()
    const func = jest.fn<() => Promise<void>>(async () => {})
    const debounced = debounceAsync(func, 100)

    const p = debounced()
    const seen: unknown[] = []
    p.catch((e) => { seen.push(e) })

    debounced.cancel()
    await Promise.resolve()          // drain the rejection microtask
    jest.advanceTimersByTime(1_000)

    expect(func).not.toHaveBeenCalled()
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ name: 'AbortError' })
  })

  it('cancel only affects the current window; a later call still fires', async () => {
    jest.useFakeTimers()
    const func = jest.fn<() => Promise<void>>(async () => {})
    const debounced = debounceAsync(func, 100)

    const p1 = debounced()
    const seen: unknown[] = []
    p1.catch((e) => { seen.push(e) })
    debounced.cancel()            // drops window 1

    const p2 = debounced()        // fresh window
    jest.advanceTimersByTime(100)
    await Promise.resolve()

    expect(func).toHaveBeenCalledTimes(1)
    expect(seen).toHaveLength(1)
    await expect(p2).resolves.toBeUndefined()
  })

  it('cancel is a no-op with nothing pending and when a run is already firing', async () => {
    jest.useFakeTimers()
    let release: () => void = () => {}
    const func = jest.fn<() => Promise<number>>(
      () => new Promise<number>((resolve) => { release = () => resolve(9) }),
    )
    const debounced = debounceAsync(func, 100)

    debounced.cancel()            // nothing pending → no-op, no throw

    const p = debounced()
    const seen: unknown[] = []
    p.catch((e) => { seen.push(e) })

    jest.advanceTimersByTime(100) // timer fires → func in-flight
    await Promise.resolve()
    debounced.cancel()            // already fired → no-op
    release()
    await Promise.resolve()

    expect(seen).toHaveLength(0)
    await expect(p).resolves.toBe(9)
  })
})
