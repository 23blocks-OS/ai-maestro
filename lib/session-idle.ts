/**
 * Session idle detection — one source of truth for "is this pane busy?".
 *
 * `sessionActivity` is stamped by the PTY layer in server.mjs every time a
 * session produces output, so "no output for a while" is our proxy for "the
 * agent is not mid-turn". It is a proxy, not a fact: an agent thinking
 * silently for longer than the threshold reads as idle. That is the right
 * failure direction — treating a quiet agent as idle costs at most one
 * mistimed notification, while treating a busy one as idle is what eats it.
 *
 * Extracted from sessions-service so the wake path can ask the question
 * without importing the whole session service graph.
 */

import { sessionActivity } from '@/services/shared-state'

/** No output for this long ⇒ treat the session as idle. */
export const IDLE_THRESHOLD_MS = 30 * 1000

/** Milliseconds since the session last produced output, or null if never seen. */
export function msSinceActivity(sessionName: string): number | null {
  const activity = sessionActivity.get(sessionName)
  return activity ? Date.now() - activity : null
}

/**
 * Check if a session is idle based on activity threshold.
 *
 * A session we have never seen output from counts as idle: it is either freshly
 * attached or sitting at a prompt, and in both cases there is nothing to
 * interrupt.
 */
export function isSessionIdle(sessionName: string): boolean {
  const since = msSinceActivity(sessionName)
  if (since === null) return true
  return since > IDLE_THRESHOLD_MS
}
