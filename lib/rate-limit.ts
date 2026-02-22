/**
 * Simple in-memory rate limiter for governance password operations.
 * Tracks failed attempts per key with a fixed time window.
 * Phase 1 only — no distributed state needed for localhost.
 */

const limits = new Map<string, { count: number; resetAt: number }>()

const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_WINDOW_MS = 60_000 // 1 minute

/** Check if the rate limit allows another attempt */
export function checkRateLimit(
  key: string,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
  windowMs: number = DEFAULT_WINDOW_MS
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now()
  const entry = limits.get(key)

  // Window expired -- reset
  if (entry && now >= entry.resetAt) {
    limits.delete(key)
    return { allowed: true, retryAfterMs: 0 }
  }

  // Check if over limit
  if (entry && entry.count >= maxAttempts) {
    return { allowed: false, retryAfterMs: entry.resetAt - now }
  }

  return { allowed: true, retryAfterMs: 0 }
}

/**
 * Record an attempt against the rate limiter.
 * Called on every attempt (not just failures) when used with checkAndRecordAttempt.
 * Callers using the separate check/record pattern may call this only on failure.
 * Renamed from recordFailure to recordAttempt (MF-023) to clarify that
 * checkAndRecordAttempt records ALL attempts, and callers reset on success.
 */
export function recordAttempt(key: string, windowMs: number = DEFAULT_WINDOW_MS): void {
  let entry = limits.get(key)
  const now = Date.now()
  // Reset expired windows so stale counts are not reused
  if (entry && now >= entry.resetAt) { entry = undefined; limits.delete(key) }
  const fresh = entry || { count: 0, resetAt: now + windowMs }
  limits.set(key, { count: fresh.count + 1, resetAt: fresh.resetAt })
}

/**
 * NT-006 / MF-023: Atomic check-and-record for rate limiting.
 * Checks limit AND records the attempt in one synchronous call,
 * eliminating the window between separate check/record calls.
 *
 * Records on EVERY allowed attempt (not just failures). Callers MUST call
 * resetRateLimit(key) on success to avoid exhausting the allowance.
 * This is the standard "count attempts, reset on success" pattern for auth.
 */
export function checkAndRecordAttempt(
  key: string,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
  windowMs: number = DEFAULT_WINDOW_MS
): { allowed: boolean; retryAfterMs: number } {
  const result = checkRateLimit(key, maxAttempts, windowMs)
  if (result.allowed) {
    // Record every allowed attempt; callers reset on success via resetRateLimit()
    recordAttempt(key, windowMs)
  }
  return result
}

/** @deprecated Use recordAttempt instead. Alias kept for backward compatibility. */
export const recordFailure = recordAttempt

/** Reset rate limit on successful attempt */
export function resetRateLimit(key: string): void {
  limits.delete(key)
}

// Periodic cleanup to prevent Map from growing unbounded
// (defensive — governance operations are infrequent so this rarely matters)
// Guard: skip in test to avoid vitest "open handles" warnings
if (typeof setInterval !== 'undefined' && process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of limits) {
      if (now >= entry.resetAt) limits.delete(key)
    }
  }, 5 * 60_000).unref() // Every 5 minutes, unref to not block process exit
}
