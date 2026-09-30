/**
 * Throttles an async function to one execution per `wait` window: the first call
 * runs immediately, a call made while it is in flight shares that promise, and a
 * call made inside the window after it settled is dropped (`undefined`).
 *
 * Use {@link debounceAsync} instead when every call has to run, or when the
 * caller needs the result of its own call.
 */
export const throttleAsync = <Args extends unknown[], R>(
  func: (...args: Args) => Promise<R>,
  wait: number,
): ((...args: Args) => Promise<R | undefined>) => {
  let windowStart = 0
  let inFlight: Promise<R | undefined> | undefined

  return (...args: Args): Promise<R | undefined> => {
    if (inFlight) {
      return inFlight
    }

    const now = Date.now()
    if (now - windowStart < wait) {
      return Promise.resolve(undefined)
    }
    windowStart = now

    let started: Promise<R>
    try {
      started = func(...args)
    }
    catch (error) {
      // A sync-throwing func must reject the caller, not throw through it.
      return Promise.reject(error)
    }

    inFlight = started.finally(() => {
      inFlight = undefined
    })
    return inFlight
  }
}
