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
 *
 * KNOWN COVERAGE GAP — read before relying on this for a wake decision.
 *
 * `sessionActivity` is only stamped while a PTY is attached (someone has the
 * agent's terminal open in the dashboard). For an agent nobody is watching,
 * the map is never written, msSinceActivity() returns null, and this reports
 * IDLE regardless of what the agent is actually doing. So the idle gate in
 * the pane wake route engages for observed agents and is inert for the rest.
 *
 * That is a real limitation, not a rounding error, and these alternatives were
 * measured and rejected rather than assumed:
 *   - tmux `#{session_activity}` reported 25 minutes stale on an agent that was
 *     visibly mid-turn.
 *   - Diffing two pane captures 600ms apart was backwards in both directions:
 *     identical on a working agent, different on an idle one.
 *
 * The real fix is to persist the state the Claude Code hook already knows. It
 * fires on Stop / Notification(idle_prompt) and posts a `status` to
 * /api/sessions/activity/update, but that status is only broadcast, never
 * stored anywhere the wake path can read. Persisting it would give a true
 * busy/idle signal for every hooked agent, attached or not.
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
