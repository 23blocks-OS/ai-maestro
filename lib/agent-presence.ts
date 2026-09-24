/**
 * What an agent is doing, as one rule every view shares.
 *
 * Before this, each view picked its own colours and the same colour meant
 * different things: green was "working" in the sidebar and "ready for input" in
 * the chat; amber was "waiting" in the sidebar and "working" in the chat; the
 * sidebar also called an agent "waiting" when it had simply been idle for a
 * minute (Claude Code's idle_prompt notification), so "needs you" and "done,
 * holding" looked the same.
 *
 *   working    green, pulsing   a turn is running
 *   needs-you  orange, pulsing  it asked for approval or a question is open
 *   ready      yellow, steady   the turn finished; holding for the next task
 *   offline    grey             no session (hibernated or stopped)
 *
 * From the Claude Code hook: UserPromptSubmit/SessionStart → active;
 * PermissionRequest (tool approvals and AskUserQuestion) → permission_request;
 * Notification(permission_prompt) → waiting_for_input + permission_prompt;
 * Stop → idle; Notification(idle_prompt) → waiting_for_input + idle_prompt,
 * which is only "still idle after a minute", i.e. ready, not needs-you.
 */

export type AgentPresence = 'working' | 'needs-you' | 'ready' | 'offline'

/** Hook notification types that mean the agent is blocked on the user */
const NEEDS_YOU_NOTIFICATIONS = new Set(['permission_prompt', 'elicitation_dialog'])

/** Is this hook report the agent blocked on the user (not merely idle)? */
export function hookNeedsYou(hookStatus?: string | null, notificationType?: string | null): boolean {
  if (hookStatus === 'permission_request') return true
  if (hookStatus === 'waiting_for_input') return NEEDS_YOU_NOTIFICATIONS.has(notificationType || '')
  return false
}

export function presenceFrom(opts: {
  online: boolean
  /** Sidebar activity: 'active' | 'waiting' | 'idle' */
  activity?: string | null
  hookStatus?: string | null
  notificationType?: string | null
}): AgentPresence {
  if (!opts.online) return 'offline'
  if (hookNeedsYou(opts.hookStatus, opts.notificationType)) return 'needs-you'
  if (opts.activity === 'waiting') {
    // Older servers report idle_prompt as 'waiting'; only a real block is needs-you
    return opts.hookStatus || opts.notificationType ? 'ready' : 'needs-you'
  }
  if (opts.activity === 'active' || opts.hookStatus === 'active' || opts.hookStatus === 'working') return 'working'
  return 'ready'
}

export interface PresenceStyle {
  label: string
  /** Tooltip */
  title: string
  /** Dot classes */
  dot: string
  /** Text colour for the label */
  text: string
  /** Avatar ring colour */
  ring: string
}

export const PRESENCE_STYLE: Record<AgentPresence, PresenceStyle> = {
  working: {
    label: 'Working',
    title: 'Working: a turn is running',
    dot: 'bg-emerald-500 ring-2 ring-emerald-500/30 animate-pulse',
    text: 'text-emerald-400',
    ring: 'ring-emerald-500/80',
  },
  'needs-you': {
    label: 'Needs you',
    title: 'Needs you: waiting for your approval or answer',
    dot: 'bg-orange-500 ring-2 ring-orange-500/40 animate-pulse',
    text: 'text-orange-400',
    ring: 'ring-orange-500/90',
  },
  ready: {
    label: 'Ready',
    title: 'Ready: finished, holding for the next task',
    dot: 'bg-yellow-400 ring-2 ring-yellow-400/25',
    text: 'text-yellow-300',
    ring: 'ring-yellow-400/60',
  },
  offline: {
    label: 'Offline',
    title: 'Offline: no session running',
    dot: 'bg-gray-500 ring-2 ring-gray-500/30',
    text: 'text-gray-400',
    ring: 'ring-gray-600/40',
  },
}
