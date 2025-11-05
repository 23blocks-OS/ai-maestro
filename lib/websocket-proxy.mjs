/**
 * WebSocket Proxy for Remote Sessions
 *
 * Proxies WebSocket connections from the manager to remote worker hosts.
 * Enables terminal streaming across machines in the Manager/Worker pattern.
 */

import WebSocket from 'ws'
import { getHostById } from './hosts-config-server.mjs'

/**
 * Create a WebSocket proxy connection to a remote host
 *
 * @param {WebSocket} clientWs - WebSocket from browser to manager
 * @param {string} sessionName - Name of the session to connect to
 * @param {string} hostId - ID of the remote host
 */
export function createRemoteProxy(clientWs, sessionName, hostId) {
  const host = getHostById(hostId)

  if (!host) {
    console.error(`[WS-Proxy] Unknown host: ${hostId}`)
    clientWs.close(1008, 'Unknown host')
    return
  }

  if (host.type === 'local') {
    console.error(`[WS-Proxy] Attempted to proxy to local host: ${hostId}`)
    clientWs.close(1008, 'Cannot proxy to local host')
    return
  }

  // Convert HTTP URL to WebSocket URL
  const workerWsUrl = host.url.replace(/^http/, 'ws') + `/term?name=${encodeURIComponent(sessionName)}`

  console.log(`[WS-Proxy] Creating proxy: ${sessionName} -> ${host.name} (${workerWsUrl})`)

  // Create WebSocket connection to worker
  const workerWs = new WebSocket(workerWsUrl)

  // Track connection state
  let isConnected = false

  // Worker connection opened
  workerWs.on('open', () => {
    isConnected = true
    console.log(`[WS-Proxy] Connected to ${host.name} for session ${sessionName}`)
  })

  // Proxy: Client → Worker
  clientWs.on('message', (data) => {
    if (workerWs.readyState === WebSocket.OPEN) {
      workerWs.send(data)
    }
  })

  // Proxy: Worker → Client
  workerWs.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data)
    }
  })

  // Handle client disconnect
  clientWs.on('close', (code, reason) => {
    console.log(`[WS-Proxy] Client disconnected from ${sessionName} on ${host.name}`)
    if (workerWs.readyState === WebSocket.OPEN || workerWs.readyState === WebSocket.CONNECTING) {
      workerWs.close(1000, 'Client disconnected')
    }
  })

  // Handle worker disconnect
  workerWs.on('close', (code, reason) => {
    console.log(`[WS-Proxy] Worker connection closed for ${sessionName} on ${host.name}: ${code} ${reason}`)
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, `Remote connection closed: ${reason || 'Unknown reason'}`)
    }
  })

  // Handle client errors
  clientWs.on('error', (error) => {
    console.error(`[WS-Proxy] Client WebSocket error for ${sessionName}:`, error.message)
    if (workerWs.readyState === WebSocket.OPEN || workerWs.readyState === WebSocket.CONNECTING) {
      workerWs.close(1011, 'Client error')
    }
  })

  // Handle worker errors
  workerWs.on('error', (error) => {
    console.error(`[WS-Proxy] Worker WebSocket error for ${sessionName} on ${host.name}:`, error.message)
    if (clientWs.readyState === WebSocket.OPEN) {
      if (!isConnected) {
        // Connection failed before establishing
        clientWs.close(1011, `Failed to connect to ${host.name}: ${error.message}`)
      } else {
        // Connection was established but errored
        clientWs.close(1011, `Remote connection error: ${error.message}`)
      }
    }
  })
}
