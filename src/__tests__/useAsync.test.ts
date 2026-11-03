import { renderHook, act, waitFor } from '@testing-library/react'
import { useAsync, useDelayedAsync } from '../useAsync'
import { describe, it, jest, expect } from '@jest/globals'

describe('useAsync', () => {
  it('should execute on mount by default', async () => {
    const mockFn = jest.fn().mockResolvedValue('result')

    const { result } = renderHook(() => useAsync(mockFn))

    expect(result.current.isExecuting).toBe(true)
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isExecuting).toBe(false)
    })

    expect(result.current.data).toBe('result')
    expect(result.current.error).toBeNull()
    expect(mockFn).toHaveBeenCalledTimes(1)
  })

  it('should not execute on mount when executeOnMount is false', () => {
    const mockFn = jest.fn().mockResolvedValue('result')

    const { result } = renderHook(() => useAsync(mockFn, [], {}, false))

    expect(result.current.isExecuting).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeNull()
    expect(mockFn).not.toHaveBeenCalled()
  })

  it('should handle errors', async () => {
    const error = new Error('test error')
    const mockFn = jest.fn().mockRejectedValue(error)

    const { result } = renderHook(() => useAsync(mockFn))

    await waitFor(() => {
      expect(result.current.isExecuting).toBe(false)
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe(error)
  })

  it('should execute manually with arguments', async () => {
    const mockFn = jest.fn().mockResolvedValue('manual result')

    const { result } = renderHook(() => useAsync(mockFn, [], {}, false))

    await act(async () => {
      await result.current.execute('arg1', 'arg2')
    })

    expect(result.current.data).toBe('manual result')
    expect(result.current.args).toEqual(['arg1', 'arg2'])
    expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2')
  })

  it('should handle continueWith and merge data', async () => {
    const mockFn = jest.fn().mockResolvedValue({ items: [1, 2] })

    const { result } = renderHook(() => useAsync(mockFn))

    await waitFor(() => {
      expect(result.current.data).toEqual({ items: [1, 2] })
    })

    const continueCallback = jest.fn().mockResolvedValue({ items: [3, 4] })
    const merger = (
      oldData: { items: number[] } | null,
      newData: { items: number[] } | null,
    ) => ({
      items: [...(oldData?.items ?? []), ...(newData?.items ?? [])],
    })

    const continueFn = result.current.continueWith(continueCallback, merger)

    await act(async () => {
      await continueFn()
    })

    expect(result.current.data).toEqual({ items: [1, 2, 3, 4] })
    expect(result.current.isContinuing).toBe(false)
  })

  it('should clear error on new execution', async () => {
    const error = new Error('test error')
    const mockFn = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('success')

    const { result } = renderHook(() => useAsync(mockFn))

    await waitFor(() => {
      expect(result.current.error).toBe(error)
    })

    await act(async () => {
      await result.current.execute()
    })

    expect(result.current.error).toBeNull()
    expect(result.current.data).toBe('success')
  })

  it('ignores a result that arrives after the result of a newer execution', async () => {
    const pending: Array<(value: string) => void> = []
    const mockFn = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          pending.push(resolve)
        }),
    )
    const { result } = renderHook(() => useAsync(mockFn, [], {}, false))

    let older!: Promise<void>
    let newer!: Promise<void>
    act(() => {
      older = result.current.execute()
      newer = result.current.execute()
    })

    await act(async () => {
      pending[0]('older')
      await older
    })
    // The newer execution is still in progress.
    expect(result.current.data).toBeNull()
    expect(result.current.isExecuting).toBe(true)

    await act(async () => {
      pending[1]('newer')
      await newer
    })
    expect(result.current.data).toBe('newer')
    expect(result.current.isExecuting).toBe(false)
  })

  it('ignores an error that arrives after the result of a newer execution', async () => {
    const pending: Array<{
      resolve: (value: string) => void
      reject: (error: Error) => void
    }> = []
    const mockFn = jest.fn(
      () =>
        new Promise<string>((resolve, reject) => {
          pending.push({ resolve, reject })
        }),
    )
    const { result } = renderHook(() => useAsync(mockFn, [], {}, false))

    let older!: Promise<void>
    let newer!: Promise<void>
    act(() => {
      older = result.current.execute()
      newer = result.current.execute()
    })
    await act(async () => {
      pending[1].resolve('newer')
      await newer
    })
    await act(async () => {
      pending[0].reject(new Error('older failed'))
      await older
    })

    expect(result.current.data).toBe('newer')
    expect(result.current.error).toBeNull()
  })

  it('ignores the result for old dependencies after the dependencies change', async () => {
    const pending = new Map<string, (value: string) => void>()
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useAsync(
          () =>
            new Promise<string>((resolve) => {
              pending.set(id, resolve)
            }),
          [id],
        ),
      { initialProps: { id: 'a' } },
    )

    rerender({ id: 'b' })
    await act(async () => {
      pending.get('b')!('data for b')
    })
    await act(async () => {
      pending.get('a')!('data for a')
    })

    expect(result.current.data).toBe('data for b')
    expect(result.current.isExecuting).toBe(false)
  })

  it('should clear error when clearError is called', async () => {
    const error = new Error('test error')
    const mockFn = jest.fn().mockRejectedValue(error)

    const { result } = renderHook(() => useAsync(mockFn))

    await waitFor(() => {
      expect(result.current.error).toBe(error)
    })

    act(() => {
      result.current.clearError()
    })

    expect(result.current.error).toBeNull()
  })
})

describe('useDelayedAsync', () => {
  it('should not execute on mount', () => {
    const mockFn = jest.fn().mockResolvedValue('result')

    const { result } = renderHook(() => useDelayedAsync(mockFn))

    expect(result.current.isExecuting).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(mockFn).not.toHaveBeenCalled()
  })

  it('should execute when execute is called', async () => {
    const mockFn = jest.fn().mockResolvedValue('delayed result')

    const { result } = renderHook(() => useDelayedAsync(mockFn))

    await act(async () => {
      await result.current.execute()
    })

    expect(result.current.data).toBe('delayed result')
  })
})
