/**
 * Agent execution mode (terminal ⇄ streaming).
 *
 * An agent is ONE entity; "terminal" (tmux TUI) vs "streaming" (Agent SDK, stream-json) is how it runs.
 * Only one runs at a time, and the server enforces it: the mode is stored on the agent, and switching
 * (POST /api/agents/:id/runtime-mode) stops the running mode before the other starts, resuming the
 * agent's own conversation.
 */

import type { Agent } from '@/types/agent'

export type RuntimeMode = 'terminal' | 'streaming'

export function runtimeModeOf(agent: Pick<Agent, 'runtimeMode'> | null | undefined): RuntimeMode {
  return agent?.runtimeMode === 'streaming' ? 'streaming' : 'terminal'
}

/** Ask the server to switch the agent's mode. The local server proxies an agent on another host. */
export async function requestRuntimeMode(agentId: string, mode: RuntimeMode): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`/api/agents/${agentId}/runtime-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, message: data?.message || data?.error || (res.ok ? 'Switched' : `Could not switch (${res.status})`) }
  } catch {
    return { ok: false, message: 'Could not reach the server' }
  }
}
