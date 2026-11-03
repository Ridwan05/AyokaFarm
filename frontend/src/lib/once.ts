// A double tap must never save twice. Forms ignore a second tap while saving; this is the safety net
// beneath them: an identical call made while the first is still running shares the first one's result.

const running = new Map<string, Promise<unknown>>()

/** Wraps `fn` so that an identical call (same name and arguments) made while one is running doesn't run again. */
export function once<A extends unknown[], R>(name: string, fn: (...args: A) => R): (...args: A) => R {
  return (...args: A) => {
    let key: string
    try {
      key = `${name}:${JSON.stringify(args)}`
    } catch {
      return fn(...args)
    }
    const busy = running.get(key)
    if (busy) return busy as R
    const out = fn(...args)
    // Only calls that return a promise (saves) are tracked; plain lookups pass straight through.
    if (out instanceof Promise) {
      const tracked = out.finally(() => running.delete(key))
      running.set(key, tracked)
      return tracked as R
    }
    return out
  }
}

/** `once` for every function on an object, e.g. the store's actions. */
export function onceEach<T extends object>(actions: T): T {
  return Object.fromEntries(Object.entries(actions).map(([k, v]) => [k, typeof v === 'function' ? once(k, v as (...a: unknown[]) => unknown) : v])) as T
}
