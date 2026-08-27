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
 * TWO SIGNALS, IN PRIORITY ORDER
 *
 * 1. The Claude Code hook's reported state (authoritative). It fires on Stop /
 *    SessionStart / Notification and knows what the agent is actually doing.
 *    Works for every hooked agent whether or not anyone is watching it.
 *
 * 2. PTY output recency (fallback). Only written while a terminal is attached,
 *    so it covers observed agents and silently reports "idle" for the rest —
 *    which is why signal 1 exists.
 *
 * Two other candidates were measured and REJECTED, not assumed:
 *   - tmux `#{session_activity}` was 25 minutes stale on an agent that was
 *     visibly mid-turn.
 *   - Diffing two pane captures 600ms apart was backwards in both directions:
 *     identical on a working agent, different on an idle one.
 */

import { sessionActivity, hookStatus } from '@/services/shared-state'

/** No output for this long ⇒ treat the session as idle. */
export const IDLE_THRESHOLD_MS = 30 * 1000

/**
 * How long a hook-reported state stays authoritative.
 *
 * Bounded on purpose. An agent that dies mid-turn leaves its last report as
 * `active` forever, and without an expiry every future wake would defer against
 * a state that will never change. After this we fall back to PTY recency.
 */
export const HOOK_STATUS_TTL_MS = 15 * 60 * 1000

/**
 * Does a hook-reported state mean "safe to inject right now"?
 *
 * Conservative by design, because the cost of the two mistakes is not
 * symmetric: deferring a wake on a genuinely idle agent delays it by one tick,
 * while injecting into a PERMISSION PROMPT types the message into a modal and
 * answers it. Only states we positively recognise as waiting count as idle.
 */
function hookStateIsIdle(state: { status: string; notificationType?: string }): boolean {
  // Stop fired without blocking: the turn is over.
  if (state.status === 'idle') return true
  // A notification that the agent is waiting on the user — but ONLY the
  // idle-prompt kind. permission_prompt means a modal is up.
  if (state.status === 'waiting_for_input') return state.notificationType === 'idle_prompt'
  // 'active', 'permission_request', and anything unrecognised: do not inject.
  return false
}

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
  // 1. The hook's own report wins while it is fresh — it is the only signal
  //    that exists for an agent with no attached terminal. Guarded because
  //    _sharedState is late-initialised across two module graphs; a missing
  //    map should degrade to the PTY signal, not throw inside a wake.
  const reported = hookStatus?.get(sessionName)
  if (reported && Date.now() - reported.at < HOOK_STATUS_TTL_MS) {
    return hookStateIsIdle(reported)
  }

  // 2. Fall back to PTY output recency.
  const since = msSinceActivity(sessionName)
  if (since === null) return true
  return since > IDLE_THRESHOLD_MS
}

/**
 * True if the Claude Code hook has reported for this session recently — i.e. an
 * agent TUI is live in the pane rather than a bare shell. Used to decide
 * whether a notification can be sent as plain text or must be wrapped in
 * `echo` so a shell does not try to execute it.
 */
export function hasHookReport(sessionName: string): boolean {
  const reported = hookStatus?.get(sessionName)
  return !!reported && Date.now() - reported.at < HOOK_STATUS_TTL_MS
}

/** Which signal answered, for logging and the operator surface. */
export function idleSource(sessionName: string): 'hook' | 'pty' | 'none' {
  const reported = hookStatus?.get(sessionName)
  if (reported && Date.now() - reported.at < HOOK_STATUS_TTL_MS) return 'hook'
  return msSinceActivity(sessionName) === null ? 'none' : 'pty'
}
