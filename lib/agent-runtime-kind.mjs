/**
 * How an agent is running right now, beyond tmux. AI Maestro knew only tmux: an agent running outside
 * tmux (its own terminal or app) or as a streaming SDK session looked asleep, so restore woke a second
 * copy in tmux reading the same mail (Dahlia, 2026-10-30). Plain ESM: server.mjs and the services use it.
 */

import fs from 'fs'
import { hookStateFilePath } from './chat-transcript.mjs'
import { hasStreamSession } from './streaming-bridge.mjs'

/** A Claude session seen this recently, and not ended, counts as still running */
export const OUTSIDE_LIVE_MS = 12 * 60 * 60 * 1000

/**
 * Is the agent's own Claude session running outside tmux? From the hook's state for its folder: the
 * session the hook saw last there is the agent's own (its claudeSessionId), it has not ended, and it was
 * active recently. The folder is shared by several agents, so the session id is what makes it this agent.
 */
export function runningOutsideTmux(agent, { now = Date.now() } = {}) {
  const dir = agent?.workingDirectory || agent?.sessions?.[0]?.workingDirectory
  if (!agent?.claudeSessionId || !dir) return false
  try {
    const s = JSON.parse(fs.readFileSync(hookStateFilePath(dir), 'utf8'))
    if (s.sessionId !== agent.claudeSessionId) return false
    if (s.lastEvent === 'SessionEnd' || s.status === 'ended') return false
    const at = Date.parse(s.updatedAt)
    return Number.isFinite(at) && now - at < OUTSIDE_LIVE_MS
  } catch {
    return false
  }
}

/** A live streaming (Agent SDK) session for this agent, keyed by id or name as /stream-chat does */
export function runningAsStream(agent) {
  return !!agent && (hasStreamSession(agent.id) || (!!agent.name && hasStreamSession(agent.name)))
}

/**
 * The agent's runtime: 'terminal' (a tmux session with its exact name), 'streaming', 'outside'
 * (its own terminal or app), or null when nothing is running. `tmuxLive` comes from the caller,
 * which already knows its tmux sessions.
 */
export function runtimeOf(agent, { tmuxLive = false, now = Date.now() } = {}) {
  if (tmuxLive) return 'terminal'
  if (runningAsStream(agent)) return 'streaming'
  if (runningOutsideTmux(agent, { now })) return 'outside'
  return null
}
