/**
 * Shared State Bridge (ESM) - Thin wrapper for server.mjs to import
 *
 * Uses globalThis to share the same Maps/Sets with the TypeScript version
 * (services/shared-state.ts). This mirrors the pattern used by
 * lib/cerebellum/session-bridge.mjs.
 *
 * server.mjs imports THIS file. API routes (via Next.js) import shared-state.ts.
 * Both reference the same globalThis objects, so state is truly shared.
 *
 * NT-039: SYNC WARNING -- This file intentionally duplicates the logic in
 * services/shared-state.ts because server.mjs is plain ESM and cannot import
 * TypeScript directly. Any changes to broadcastStatusUpdate() or the
 * globalThis._sharedState shape MUST be mirrored in both files.
 */

// Initialize shared maps on globalThis if not already present
if (!globalThis._sharedState) {
  globalThis._sharedState = {
    sessionActivity: new Map(),      // sessionName -> lastActivityTimestamp (ms)
    terminalSessions: new Map(),     // sessionName -> { clients, ptyProcess, logStream, ... }
    statusSubscribers: new Set(),    // Set<WebSocket> for /status subscribers
    companionClients: new Map(),     // agentId -> Set<WebSocket> for /companion-ws
  }
}

const state = globalThis._sharedState

export const sessionActivity = state.sessionActivity
export const terminalSessions = state.terminalSessions
export const statusSubscribers = state.statusSubscribers
export const companionClients = state.companionClients

/**
 * Broadcast a status update to all /status WebSocket subscribers.
 * Used by API routes and server.mjs.
 */
// Optional callback invoked after every status broadcast — set by server.mjs for auto-continue
// This avoids duplicating agent-registry logic in this bridge file.
let _onStatusUpdate = null
export function setOnStatusUpdateCallback(fn) {
  _onStatusUpdate = fn
}

export function broadcastStatusUpdate(sessionName, status, hookStatus, notificationType) {
  const message = JSON.stringify({
    type: 'status_update',
    sessionName,
    status,
    hookStatus,
    notificationType,
    timestamp: new Date().toISOString()
  })

  // SF-039: Clean up dead/closed WebSocket subscribers during broadcast
  // to prevent memory leaks from accumulated stale connections.
  const dead = []
  statusSubscribers.forEach(ws => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(message)
    } else {
      dead.push(ws)
    }
  })
  for (const ws of dead) {
    statusSubscribers.delete(ws)
  }

  // Notify auto-continue system of status changes
  if (_onStatusUpdate) {
    _onStatusUpdate(sessionName, status, hookStatus, notificationType)
  }
}
