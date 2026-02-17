import type { DependencyList } from 'react'
import { useCallback, useEffect, useState } from 'react'

/**
 * Merge function type for combining old and new async data.
 */
export type MergeType<R> = (oldData: R | null, newData: R | null) => R | null

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
  /** The error from the last async operation, or null. */
  error: Error | null | undefined
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
  executeOnMount = true,
): AsyncResponseType<R, A> => {
  const [data, setData] = useState<R | null>(null)
  const [isExecuting, setIsExecuting] = useState(executeOnMount)
  const [isContinuing, setIsContinuing] = useState(false)
  const [error, setError] = useState<Error | null | undefined>(null)
  const [args, setArgs] = useState<A>([] as unknown as A)

  const executeOrContinue = async (
    callback: () => Promise<R>,
    setIsLoading: typeof setIsExecuting,
    merger?: MergeType<R>,
  ) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await callback()
      if (merger) {
        setData(prevData => merger(prevData, response))
      }
      else {
        setData(response)
      }
    }
    catch (err: unknown) {
      setError(err as Error)
    }
    finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (executeOnMount) {
      void executeOrContinue(asyncCallback, setIsExecuting)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)

  return {
    data,
    isExecuting,
    isContinuing,
    isLoading: isExecuting || isContinuing,
    args,
    error,
    execute: useCallback(async (...args: A) => {
      setArgs(args)
      return executeOrContinue(
        async () => asyncCallback(...args),
        setIsExecuting,
      )
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, dependencies),
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
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useDelayedAsync = <R, A extends any[]>(
  ...[arg1, arg2]: Parameters<typeof useAsync<R, A>>
) => {
  return useAsync<R, A>(arg1, arg2, false)
}
