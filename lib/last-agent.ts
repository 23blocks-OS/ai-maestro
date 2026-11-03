/**
 * The agent this browser had open last (B028). Restored on load, so a refresh or a return from another
 * page never opens a different agent that the next message would go to. One key for every layout; the
 * value is the one the phone layout already saved, so phones keep their choice.
 */
export const LAST_AGENT_KEY = 'aimaestro-mobile-agent'

export function loadLastAgent(): string | null {
  try { return localStorage.getItem(LAST_AGENT_KEY) } catch { return null }
}

export function saveLastAgent(id: string | null): void {
  if (!id) return
  try { localStorage.setItem(LAST_AGENT_KEY, id) } catch { /* private mode: nothing to remember */ }
}

/**
 * The agent to open when none is open: the first online one, but only on a browser that never had one
 * open. A browser that had one (even an agent that is gone now) gets nothing, never a silent pick.
 */
export function autoPickAgent(activeId: string | null, saved: string | null, firstOnlineId: string | undefined): string | null {
  if (activeId || saved) return null
  return firstOnlineId || null
}
