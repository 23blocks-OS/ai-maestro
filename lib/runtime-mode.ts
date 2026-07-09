/**
 * Agent execution mode (terminal ⇄ streaming).
 *
 * An agent is ONE entity; "terminal" (tmux TUI) vs "streaming" (Agent SDK,
 * stream-json) is how it's currently being run, chosen at wake. Continuity
 * across modes comes from `--resume` on the agent's session_id (server-side).
 *
 * The MODE PREFERENCE is stored per-agent in localStorage (which tab is the
 * agent's home). The streaming SESSION itself is server-side and shared across
 * devices, so a phone opening the streaming tab attaches to the same session —
 * only the "default tab" preference is device-local (cross-device sync of the
 * preference is a later enhancement).
 */

export type RuntimeMode = 'terminal' | 'streaming'

const key = (agentId: string) => `agent-runtime-mode-${agentId}`

export function getRuntimeMode(agentId: string): RuntimeMode {
  if (typeof window === 'undefined') return 'terminal'
  return window.localStorage.getItem(key(agentId)) === 'streaming' ? 'streaming' : 'terminal'
}

export function setRuntimeMode(agentId: string, mode: RuntimeMode): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key(agentId), mode)
}
