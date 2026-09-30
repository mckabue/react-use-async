import type { DependencyList } from 'react'
import { debounceAsync } from './debounceAsync'
import { throttleAsync } from './throttleAsync'
import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * Merge function type for combining old and new async data.
 */
export type MergeType<R> = (oldData: R | null, newData: R | null) => R | null

/**
 * Timing for `execute`. Pass at most one of the two, or neither:
 *
 * - `debounce`: wait for `ms` of quiet, then run once with the latest args.
 * - `throttle`: run now, then drop calls until the window is free.
 *
 * `0` (the default) applies no timing at all. The mount execution is never timed.
 */
export type AsyncTiming =
  | { debounce?: number; throttle?: never }
  | { throttle?: number; debounce?: never }

/**
 * Return type of the useAsync hook.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AsyncResponseType<R, A extends any[]> = {
  /** The resolved data, or null if not yet resolved. */
  data: R | null
  /** Whether the primary execution is in progress. */
  isExecuting: boolean
  /** Whether a continuation is in progress. */
  isContinuing: boolean
  /** Whether any async operation is in progress (isExecuting || isContinuing). */
  isLoading: boolean
  /** The arguments passed to the last `execute()` call. */
  args: A
  /** The number of times `execute()` has been called. */
  executionCount: number
  /** The error from the last async operation, or null. */
  error: Error | null | undefined
  /** Clear the current error state. Useful for dismissing errors on navigation or user action. */
  clearError: () => void
  /** Manually trigger the async callback with arguments. */
  execute: (...args: A) => Promise<void>
  /**
   * Continue with an additional async operation, merging results with the existing data.
   * Returns a function that, when called, executes the continuation.
   */
  continueWith: (
    continueCallback: () => Promise<R>,
    merger: MergeType<R>,
  ) => () => Promise<void>
}

/**
 * A React hook for managing async operations with loading states, error handling, and data merging.
 *
 * @param asyncCallback - The async function to execute.
 * @param dependencies - Dependency list that triggers re-execution on mount (like useEffect deps).
 * @param timing - Optional `debounce` or `throttle` for `execute`. Defaults to neither.
 * @param executeOnMount - Whether to execute the callback on mount. Defaults to true.
 * @returns An object with data, loading states, error, execute, and continueWith functions.
 *
 * @example
 * ```tsx
 * const { data, isLoading, error, execute } = useAsync(
 *   async () => fetch('/api/users').then(r => r.json()),
 * );
 *
 * if (isLoading) return <Spinner />;
 * if (error) return <Error message={error.message} />;
 * return <UserList users={data} />;
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useAsync = <R, A extends any[]>(
  asyncCallback: (...args: A) => Promise<R>,
  dependencies: DependencyList = [],
  timing: AsyncTiming = {},
  executeOnMount = true,
): AsyncResponseType<R, A> => {
  const [data, setData] = useState<R | null>(null)
  const [isExecuting, setIsExecuting] = useState(executeOnMount)
  const [isContinuing, setIsContinuing] = useState(false)
  const [error, setError] = useState<Error | null | undefined>(null)
  const [args, setArgs] = useState<A>([] as unknown as A)
  const [executionCount, setExecutionCount] = useState(0)

  const executeOrContinue = async (
    callback: () => Promise<R>,
    setIsLoading: typeof setIsExecuting,
    merger?: MergeType<R>,
  ) => {
    setIsLoading(true)
    setError(null)
    setExecutionCount((prev) => prev + 1)
    try {
      const response = await callback()
      if (merger) {
        setData((prevData) => merger(prevData, response))
      } else {
        setData(response)
      }
    } catch (err: unknown) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (executeOnMount) {
      void executeOrContinue(asyncCallback, setIsExecuting)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)

  // Wraps `execute`, not the callback: a dropped throttle call must never reach
  // executeOrContinue, or it would overwrite `data` with undefined.
  const runExecute = useCallback(async (...args: A) => {
    setArgs(args)
    return executeOrContinue(async () => asyncCallback(...args), setIsExecuting)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)

  const execute = useMemo(() => {
    const debounce = timing.debounce ?? 0
    const throttle = timing.throttle ?? 0
    if (debounce > 0 && throttle > 0) {
      throw new Error('useAsync: pass either debounce or throttle, never both')
    }
    if (debounce > 0) {
      return debounceAsync(runExecute, debounce)
    }
    if (throttle > 0) {
      return throttleAsync(runExecute, throttle)
    }
    return runExecute
  }, [runExecute, timing.debounce, timing.throttle])

  return {
    data,
    isExecuting,
    isContinuing,
    isLoading: isExecuting || isContinuing,
    args,
    executionCount,
    error,
    clearError: useCallback(() => setError(null), []),
    execute,
    continueWith: useCallback(
      (continueCallback, merger) => async () => {
        return executeOrContinue(continueCallback, setIsContinuing, merger)
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      dependencies,
    ),
  }
}

/**
 * A variant of useAsync that does NOT execute on mount.
 * Useful for user-triggered async operations (e.g., form submissions, button clicks).
 *
 * @example
 * ```tsx
 * const { execute, isLoading } = useDelayedAsync(
 *   async (id: string) => deleteUser(id),
 * );
 *
 * return <Button onClick={() => execute(userId)} loading={isLoading}>Delete</Button>;
 *
 * // With timing: one call per 500ms however hard the button is mashed.
 * const { execute } = useDelayedAsync(async () => save(), [], { throttle: 500 });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useDelayedAsync = <R, A extends any[]>(
  ...[arg1, arg2, arg3]: Parameters<typeof useAsync<R, A>>
) => {
  return useAsync<R, A>(arg1, arg2, arg3, false)
}
