import { act, renderHook } from '@testing-library/react'
import { useAsync, useDelayedAsync } from '../useAsync'
import { describe, it, jest, expect } from '@jest/globals'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('useAsync / useDelayedAsync timing', () => {
  it('does not time the mount execution', async () => {
    const fn = jest.fn(async () => 'mounted')
    const { result } = renderHook(() =>
      useAsync(fn, [], { debounce: 60_000 }, true),
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(fn).toHaveBeenCalledTimes(1)
    expect(result.current.data).toBe('mounted')
  })

  it('debounce collapses rapid executes into one run with the latest args', async () => {
    const fn = jest.fn(async (n: number) => n)
    const { result } = renderHook(() => useDelayedAsync(fn, [], { debounce: 30 }))

    await act(async () => {
      void result.current.execute(1)
      void result.current.execute(2)
      void result.current.execute(3)
    })
    expect(fn).not.toHaveBeenCalled()

    await act(async () => {
      await sleep(40)
    })

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(3)
  })

  it('throttle runs the first call and drops later calls inside the window', async () => {
    const fn = jest.fn(async (n: number) => n)
    const { result } = renderHook(() => useDelayedAsync(fn, [], { throttle: 50 }))

    await act(async () => {
      await result.current.execute(1)
    })
    expect(fn).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.execute(2)
    })
    expect(fn).toHaveBeenCalledTimes(1) // dropped

    await act(async () => {
      await sleep(60)
      await result.current.execute(3)
    })
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith(3)
  })

  it('a dropped throttle call leaves data and loading state alone', async () => {
    const fn = jest.fn(async () => 'first')
    const { result } = renderHook(() =>
      useAsync(fn, [], { throttle: 1_000 }, false),
    )

    await act(async () => {
      await result.current.execute()
    })
    expect(result.current.data).toBe('first')

    await act(async () => {
      await result.current.execute()
    })

    expect(fn).toHaveBeenCalledTimes(1)
    expect(result.current.data).toBe('first') // never overwritten with undefined
    expect(result.current.isLoading).toBe(false)
  })

  it('rejects passing both debounce and throttle', () => {
    const fn = jest.fn(async () => 1)
    const both = { debounce: 10, throttle: 10 } as unknown as { debounce: number }

    expect(() => renderHook(() => useAsync(fn, [], both, false))).toThrow(
      /never both/,
    )
  })
})
