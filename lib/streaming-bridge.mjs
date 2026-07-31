/**
 * Streaming Bridge — cross-module accessor for live SDK sessions.
 *
 * lib/streaming-runtime.mjs (raw ESM, imported by server.mjs) owns the actual
 * Session objects and stores them on `globalThis._streamSessions`. This bridge
 * is a thin reader that the Next-bundled service/delivery layer imports WITHOUT
 * pulling in the Claude Agent SDK. It exists so AMP delivery can push a message
 * into a streaming agent's live session even though the two module graphs
 * (raw-ESM server vs. webpack-bundled Next) never share instances directly.
 *
 * Mirrors the shared-state-bridge.mjs pattern.
 */

/** @returns the shared agentKey -> Session map (or an empty map if none yet). */
function sessionMap() {
  return globalThis._streamSessions || null
}

/**
 * Push a synthetic user turn into an agent's live streaming session, if one
 * exists. Returns true if a session was found and the text was queued.
 *
 * Used by the AMP delivery layer to wake a streaming agent the same way a tmux
 * notification wakes a terminal agent — except this lands directly in the SDK
 * input stream, so it is reliable regardless of the agent's TUI state.
 */
export function pushToStreamSession(agentKey, text) {
  if (!agentKey || !text) return false
  const map = sessionMap()
  if (!map) return false
  const session = map.get(String(agentKey))
  if (!session || session.closed || session.exited) return false
  try {
    session.push(text)
    return true
  } catch {
    return false
  }
}

/** True if the agent currently has a live (non-closed) streaming session. */
export function hasStreamSession(agentKey) {
  const map = sessionMap()
  if (!map || !agentKey) return false
  const s = map.get(String(agentKey))
  return !!(s && !s.closed && !s.exited)
}
