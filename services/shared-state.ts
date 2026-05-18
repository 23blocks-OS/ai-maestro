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
  agentId?: string
  status: string
  hookStatus?: string
  notificationType?: string
  timestamp: string
}

export interface CallSessionState {
  agentId: string
  agentName: string
  callSessionName: string
  workingDirectory: string
  createdAt: number
  ptyObserver?: any  // node-pty read-only PTY feeding voice buffer
}

// ---------------------------------------------------------------------------
// Shared globalThis initialization
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var _sharedState: {
    sessionActivity: Map<string, number>
    agentActivity: Map<string, number>
    terminalSessions: Map<string, PTYSessionState>
    statusSubscribers: Set<WebSocket>
    companionClients: Map<string, Set<WebSocket>>
    callSessions: Map<string, CallSessionState>
  } | undefined
}

if (!globalThis._sharedState) {
  globalThis._sharedState = {
    sessionActivity: new Map<string, number>(),
    agentActivity: new Map<string, number>(),
    terminalSessions: new Map<string, PTYSessionState>(),
    statusSubscribers: new Set<WebSocket>(),
    companionClients: new Map<string, Set<WebSocket>>(),
    callSessions: new Map<string, CallSessionState>(),
  }
}
// Ensure callSessions exists for hot-reload / late initialization
if (!globalThis._sharedState.callSessions) {
  globalThis._sharedState.callSessions = new Map()
}

const state = globalThis._sharedState!

// ---------------------------------------------------------------------------
// Exports — all backed by globalThis._sharedState
// ---------------------------------------------------------------------------

/** sessionName -> last activity timestamp (ms). Populated by server.mjs PTY data handler. */
export const sessionActivity: Map<string, number> = state.sessionActivity

/** agentId -> last heartbeat timestamp (ms). Populated by heartbeat API for standalone agents. */
export const agentActivity: Map<string, number> = state.agentActivity

/** sessionName -> PTY process + connected clients. Populated by server.mjs WebSocket handler. */
export const terminalSessions: Map<string, PTYSessionState> = state.terminalSessions

/** Connected /status WebSocket clients. */
export const statusSubscribers: Set<WebSocket> = state.statusSubscribers

/** agentId -> connected /companion-ws clients. */
export const companionClients: Map<string, Set<WebSocket>> = state.companionClients

/** agentId -> active call session state. Populated by companion-ws handler in server.mjs. */
export const callSessions: Map<string, CallSessionState> = state.callSessions

// ---------------------------------------------------------------------------
// Broadcast a chat event to chat-subscribed WebSocket clients for a session
// ---------------------------------------------------------------------------

export function broadcastChatEvent(
  sessionName: string,
  type: string,
  payload: Record<string, unknown>
): void {
  const session = terminalSessions.get(sessionName)
  const chatClients = (session as any)?.chatClients as Set<WebSocket> | undefined
  if (!chatClients) return
  const msg = JSON.stringify({ type, ...payload })
  chatClients.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg)
  })
}

// ---------------------------------------------------------------------------
// Broadcast a status update to all /status WebSocket subscribers
// ---------------------------------------------------------------------------

export function broadcastStatusUpdate(
  sessionName: string,
  status: string,
  hookStatus?: string,
  notificationType?: string,
  agentId?: string
): void {
  const message = JSON.stringify({
    type: 'status_update',
    sessionName,
    ...(agentId && { agentId }),
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
