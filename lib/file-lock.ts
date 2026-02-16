/**
 * File Lock — in-process mutex for serializing load→modify→save operations
 *
 * Prevents concurrent read-modify-write races within a single Node.js process.
 * Each registry file gets its own named lock. When one API request is mid-write,
 * other requests for the same file queue up and run sequentially.
 *
 * This is sufficient for Phase 1 (single Next.js process, localhost).
 * For multi-process deployments, replace with advisory file locks (e.g., proper-lockfile).
 */

// Map of lock name -> queue of pending resolve callbacks
const locks = new Map<string, Array<() => void>>()
// Set of currently held lock names
const held = new Set<string>()

/**
 * Acquire a named lock. Returns a release function.
 * If the lock is already held, the caller awaits until it is released.
 */
export function acquireLock(name: string): Promise<() => void> {
  if (!held.has(name)) {
    // Lock is free — acquire immediately
    held.add(name)
    return Promise.resolve(() => releaseLock(name))
  }

  // Lock is held — enqueue and wait
  return new Promise<() => void>((resolve) => {
    if (!locks.has(name)) {
      locks.set(name, [])
    }
    locks.get(name)!.push(() => {
      resolve(() => releaseLock(name))
    })
  })
}

/**
 * Release a named lock and wake the next waiter if any.
 */
function releaseLock(name: string): void {
  const queue = locks.get(name)
  if (queue && queue.length > 0) {
    // Hand lock to next waiter (don't remove from held set)
    const next = queue.shift()!
    if (queue.length === 0) {
      locks.delete(name)
    }
    next()
  } else {
    // No waiters — release the lock
    held.delete(name)
    locks.delete(name)
  }
}

/**
 * Run a function under a named lock.
 * Convenience wrapper: acquires, runs fn, releases (even on error).
 */
export async function withLock<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
  const release = await acquireLock(name)
  try {
    return await fn()
  } finally {
    release()
  }
}
