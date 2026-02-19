/**
 * Simple in-memory rate limiter for governance password operations.
 * Tracks failed attempts per key with a sliding time window.
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

  // Window expired — reset
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

/** Record a failed attempt */
export function recordFailure(key: string, windowMs: number = DEFAULT_WINDOW_MS): void {
  const now = Date.now()
  const entry = limits.get(key) || { count: 0, resetAt: now + windowMs }
  limits.set(key, { count: entry.count + 1, resetAt: entry.resetAt })
}

/** Reset rate limit on successful attempt */
export function resetRateLimit(key: string): void {
  limits.delete(key)
}

// Periodic cleanup to prevent Map from growing unbounded
// (defensive — governance operations are infrequent so this rarely matters)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of limits) {
      if (now >= entry.resetAt) limits.delete(key)
    }
  }, 5 * 60_000).unref() // Every 5 minutes, unref to not block process exit
}
