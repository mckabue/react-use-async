/**
 * Debounces an async function. Calls within one `wait` window are coalesced
 * into a single trailing-edge execution ("last call wins"): every call
 * slides the timer and only the latest args are used. All waiters share one
 * promise for the result.
 *
 * `.cancel()` drops a pending call — waiters reject with `AbortError`
 * (attach a `.catch` if fire-and-forget); no-op once fired.
 */
export const debounceAsync = <Args extends unknown[], R>(
  func: (...args: Args) => Promise<R>,
  wait: number,
) => {
  let timeout: ReturnType<typeof setTimeout> | undefined
  let args: Args | undefined
  let pending: Promise<R> | undefined
  let resolveFn: (value: R | PromiseLike<R>) => void = () => {}
  let rejectFn: (reason: unknown) => void = () => {}

  const cancel = (): void => {
    if (timeout === undefined) {
      return // nothing scheduled (or already fired)
    }
    clearTimeout(timeout)
    timeout = undefined
    pending = undefined
    args = undefined
    rejectFn(new DOMException('Debounced call cancelled', 'AbortError'))
  }

  const executedFunction = (...nextArgs: Args): Promise<R> => {
    args = nextArgs
    clearTimeout(timeout)

    pending ??= new Promise<R>((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
    })

    timeout = setTimeout(() => {
      timeout = undefined
      const run = args!
      pending = undefined
      args = undefined
      try {
        func(...run).then(resolveFn, rejectFn)
      }
      catch (err) {
        // Sync-throwing funcs must reject waiters, not leave them hanging.
        rejectFn(err)
      }
    }, wait)

    return pending
  }

  executedFunction.cancel = cancel

  return executedFunction
}
