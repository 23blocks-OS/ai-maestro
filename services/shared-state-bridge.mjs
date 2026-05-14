/**
 * Shared State Bridge (ESM) - Thin wrapper for server.mjs to import
 *
 * Uses globalThis to share the same Maps/Sets with the TypeScript version
 * (services/shared-state.ts). This mirrors the pattern used by
 * lib/cerebellum/session-bridge.mjs.
 *
 * server.mjs imports THIS file. API routes (via Next.js) import shared-state.ts.
 * Both reference the same globalThis objects, so state is truly shared.
 */

// Initialize shared maps on globalThis if not already present
if (!globalThis._sharedState) {
  globalThis._sharedState = {
    sessionActivity: new Map(),      // sessionName -> lastActivityTimestamp (ms)
    agentActivity: new Map(),        // agentId -> lastHeartbeatTimestamp (ms) for standalone agents
    terminalSessions: new Map(),     // sessionName -> { clients, ptyProcess, logStream, ... }
    statusSubscribers: new Set(),    // Set<WebSocket> for /status subscribers
    companionClients: new Map(),     // agentId -> Set<WebSocket> for /companion-ws
  }
}

const state = globalThis._sharedState

export const sessionActivity = state.sessionActivity
export const agentActivity = state.agentActivity
export const terminalSessions = state.terminalSessions
export const statusSubscribers = state.statusSubscribers
export const companionClients = state.companionClients

/**
 * Broadcast a chat event to all chat-subscribed WebSocket clients for a session.
 * Chat clients subscribe via the terminal WebSocket with { type: 'chat:subscribe' }.
 */
export function broadcastChatEvent(sessionName, type, payload) {
  const sessions = globalThis._sharedState?.terminalSessions
  if (!sessions) return
  const session = sessions.get(sessionName)
  if (!session?.chatClients) return
  const msg = JSON.stringify({ type, ...payload })
  for (const ws of session.chatClients) {
    if (ws.readyState === 1) ws.send(msg)
  }
}

/**
 * Broadcast a status update to all /status WebSocket subscribers.
 * Used by API routes and server.mjs.
 */
export function broadcastStatusUpdate(sessionName, status, hookStatus, notificationType, agentId) {
  const message = JSON.stringify({
    type: 'status_update',
    sessionName,
    ...(agentId && { agentId }),
    status,
    hookStatus,
    notificationType,
    timestamp: new Date().toISOString()
  })

  statusSubscribers.forEach(ws => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(message)
    }
  })
}
