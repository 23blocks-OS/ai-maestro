/**
 * Shared State Module (TypeScript)
 *
 * Replaces the 5 global.* bridges between server.mjs and API routes.
 *
 * Uses globalThis._sharedState so the same Maps/Sets are shared between:
 *   - server.mjs (imports shared-state-bridge.mjs)
 *   - API routes  (import this file via @/services/shared-state)
 *
 * Both sides reference the same globalThis objects.
 */

import type WebSocket from 'ws'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PTYSessionState {
  clients: Set<WebSocket>
  ptyProcess: any  // node-pty IPty
  logStream?: any
  lastActivity?: number
  cleanupTimer?: ReturnType<typeof setTimeout>
}

export interface StatusUpdate {
  type: 'status_update'
  sessionName: string
  status: string
  hookStatus?: string
  notificationType?: string
  timestamp: string
}

// ---------------------------------------------------------------------------
// Shared globalThis initialization
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var _sharedState: {
    sessionActivity: Map<string, number>
    terminalSessions: Map<string, PTYSessionState>
    statusSubscribers: Set<WebSocket>
    companionClients: Map<string, Set<WebSocket>>
  } | undefined
}

if (!globalThis._sharedState) {
  globalThis._sharedState = {
    sessionActivity: new Map<string, number>(),
    terminalSessions: new Map<string, PTYSessionState>(),
    statusSubscribers: new Set<WebSocket>(),
    companionClients: new Map<string, Set<WebSocket>>(),
  }
}

const state = globalThis._sharedState

// ---------------------------------------------------------------------------
// Exports — all backed by globalThis._sharedState
// ---------------------------------------------------------------------------

/** sessionName -> last activity timestamp (ms). Populated by server.mjs PTY data handler. */
export const sessionActivity: Map<string, number> = state.sessionActivity

/** sessionName -> PTY process + connected clients. Populated by server.mjs WebSocket handler. */
export const terminalSessions: Map<string, PTYSessionState> = state.terminalSessions

/** Connected /status WebSocket clients. */
export const statusSubscribers: Set<WebSocket> = state.statusSubscribers

/** agentId -> connected /companion-ws clients. */
export const companionClients: Map<string, Set<WebSocket>> = state.companionClients

// ---------------------------------------------------------------------------
// Broadcast a status update to all /status WebSocket subscribers
// ---------------------------------------------------------------------------

export function broadcastStatusUpdate(
  sessionName: string,
  status: string,
  hookStatus?: string,
  notificationType?: string
): void {
  const message = JSON.stringify({
    type: 'status_update',
    sessionName,
    status,
    hookStatus,
    notificationType,
    timestamp: new Date().toISOString()
  } satisfies StatusUpdate)

  statusSubscribers.forEach(ws => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(message)
    }
  })
}
