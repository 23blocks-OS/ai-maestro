/**
 * AMP WebSocket Delivery
 *
 * Provides real-time message delivery to connected agents via WebSocket.
 * Agents connect to /v1/ws and authenticate with their API key.
 *
 * Connection lifecycle:
 *   1. Client connects to /v1/ws
 *   2. Client sends auth frame: { type: "auth", token: "amp_live_sk_..." }
 *   3. Server validates token, responds with { type: "connected", address, pending_count }
 *   4. Server delivers queued messages
 *   5. Heartbeat ping/pong every 30s
 *   6. On disconnect, mark agent offline
 *
 * Usage from server.mjs:
 *   import { createAMPWebSocketHandler } from './lib/amp-websocket.ts'
 *   // In upgrade handler: if (pathname === '/v1/ws') { ... }
 */

import type { WebSocket } from 'ws'
import { validateApiKey } from '@/lib/amp-auth'
import { getPendingMessages, acknowledgeMessage } from '@/lib/amp-relay'
import type { AMPEnvelope, AMPPayload } from '@/lib/types/amp'

// ============================================================================
// Connection Registry
// ============================================================================

/** Map of agent address → Set of connected WebSocket clients */
const connections = new Map<string, Set<WebSocket>>()

/** Map of WebSocket → agent info (for cleanup on disconnect) */
const wsMetadata = new Map<WebSocket, { address: string; agentId: string }>()

/** Auth timeout in milliseconds */
const AUTH_TIMEOUT_MS = 10_000

/** Heartbeat interval in milliseconds */
const HEARTBEAT_INTERVAL_MS = 30_000

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if an agent has any active WebSocket connections
 */
export function isAgentConnectedViaWS(address: string): boolean {
  const agentConns = connections.get(address)
  return !!agentConns && agentConns.size > 0
}

/**
 * Deliver a message to an agent via WebSocket.
 * Returns true if the message was sent to at least one connected client.
 */
export function deliverViaWebSocket(
  address: string,
  envelope: AMPEnvelope,
  payload: AMPPayload,
  senderPublicKey?: string
): boolean {
  const agentConns = connections.get(address)
  if (!agentConns || agentConns.size === 0) return false

  const message = JSON.stringify({
    type: 'message',
    envelope,
    payload,
    ...(senderPublicKey ? { sender_public_key: senderPublicKey } : {}),
    delivered_at: new Date().toISOString(),
  })

  let delivered = false
  for (const ws of agentConns) {
    try {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(message)
        delivered = true
      }
    } catch (err) {
      console.error('[AMP WS] Error sending to client:', err)
    }
  }

  return delivered
}

/**
 * Handle a new WebSocket connection for AMP delivery.
 * Called from server.mjs when a client connects to /v1/ws.
 */
export function handleAMPWebSocket(ws: WebSocket): void {
  let authenticated = false
  let authTimeout: ReturnType<typeof setTimeout>
  let heartbeatInterval: ReturnType<typeof setInterval>

  // Require auth within AUTH_TIMEOUT_MS
  authTimeout = setTimeout(() => {
    if (!authenticated) {
      ws.close(4001, 'Authentication timeout')
    }
  }, AUTH_TIMEOUT_MS)

  ws.on('message', async (data: Buffer | string) => {
    try {
      const msg = JSON.parse(typeof data === 'string' ? data : data.toString())

      if (!authenticated) {
        // First message must be auth
        if (msg.type !== 'auth' || !msg.token) {
          ws.close(4002, 'First message must be auth')
          return
        }

        const record = validateApiKey(msg.token)
        if (!record) {
          ws.send(JSON.stringify({ type: 'error', error: 'invalid_token' }))
          ws.close(4003, 'Invalid API key')
          return
        }

        // Auth successful
        authenticated = true
        clearTimeout(authTimeout)

        const address = record.address
        const agentId = record.agent_id

        // Register connection
        if (!connections.has(address)) {
          connections.set(address, new Set())
        }
        connections.get(address)!.add(ws)
        wsMetadata.set(ws, { address, agentId })

        // Get pending message count
        const pending = getPendingMessages(agentId, 1)
        const pendingCount = pending.count + pending.remaining

        ws.send(JSON.stringify({
          type: 'connected',
          address,
          pending_count: pendingCount,
        }))

        // Deliver queued messages
        if (pendingCount > 0) {
          const allPending = getPendingMessages(agentId, 100)
          for (const pendingMsg of allPending.messages) {
            ws.send(JSON.stringify({
              type: 'message',
              envelope: pendingMsg.envelope,
              payload: pendingMsg.payload,
              sender_public_key: pendingMsg.sender_public_key,
              delivered_at: new Date().toISOString(),
            }))
            // Auto-acknowledge delivered messages
            acknowledgeMessage(agentId, pendingMsg.id)
          }
        }

        // Start heartbeat
        heartbeatInterval = setInterval(() => {
          if (ws.readyState === 1) {
            ws.ping()
          } else {
            clearInterval(heartbeatInterval)
          }
        }, HEARTBEAT_INTERVAL_MS)

        console.log(`[AMP WS] Agent ${address} connected`)
        return
      }

      // Handle authenticated messages
      if (msg.type === 'ack' && msg.id) {
        const meta = wsMetadata.get(ws)
        if (meta) {
          acknowledgeMessage(meta.agentId, msg.id)
        }
      }

    } catch (err) {
      console.error('[AMP WS] Error handling message:', err)
    }
  })

  ws.on('close', () => {
    clearTimeout(authTimeout)
    clearInterval(heartbeatInterval)

    const meta = wsMetadata.get(ws)
    if (meta) {
      const agentConns = connections.get(meta.address)
      if (agentConns) {
        agentConns.delete(ws)
        if (agentConns.size === 0) {
          connections.delete(meta.address)
        }
      }
      wsMetadata.delete(ws)
      console.log(`[AMP WS] Agent ${meta.address} disconnected`)
    }
  })

  ws.on('error', (err) => {
    console.error('[AMP WS] Connection error:', err)
  })
}

/**
 * Get count of connected agents (for /v1/info)
 */
export function getConnectedAgentCount(): number {
  return connections.size
}
