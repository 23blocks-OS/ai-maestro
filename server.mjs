import { createServer } from 'http'
import { parse } from 'url'
import { WebSocketServer } from 'ws'
import WebSocket from 'ws'
import pty from 'node-pty'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { getHostById, isSelf } from './lib/hosts-config-server.mjs'
import { hostHints } from './lib/host-hints-server.mjs'
import { getOrCreateBuffer } from './lib/cerebellum/session-bridge.mjs'
import {
  sessionActivity,
  terminalSessions,
  statusSubscribers,
  companionClients,
  broadcastStatusUpdate
} from './services/shared-state-bridge.mjs'

// =============================================================================
// GLOBAL ERROR HANDLERS - Must be first to catch all errors
// =============================================================================
// These handlers prevent the server from crashing on unhandled errors.
// On Ubuntu 24.04 and other Linux systems, native modules (node-pty, cozo-node)
// can occasionally throw errors that would otherwise crash the process.

process.on('uncaughtException', (error, origin) => {
  console.error(`[CRASH-GUARD] Uncaught exception from ${origin}:`)
  console.error(error)

  // Log to file for debugging
  const crashLogPath = path.join(process.cwd(), 'logs', 'crash.log')
  const timestamp = new Date().toISOString()
  const logEntry = `[${timestamp}] Uncaught exception (${origin}):\n${error.stack || error}\n\n`

  try {
    fs.appendFileSync(crashLogPath, logEntry)
  } catch (fsError) {
    // Ignore file write errors
  }

  // Don't exit - allow the server to continue running
  // Only exit for truly fatal errors
  if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
    console.error('[CRASH-GUARD] Fatal error, exiting...')
    process.exit(1)
  }
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH-GUARD] Unhandled promise rejection:')
  console.error('Reason:', reason)

  // Log to file for debugging
  const crashLogPath = path.join(process.cwd(), 'logs', 'crash.log')
  const timestamp = new Date().toISOString()
  const logEntry = `[${timestamp}] Unhandled rejection:\n${reason?.stack || reason}\n\n`

  try {
    fs.appendFileSync(crashLogPath, logEntry)
  } catch (fsError) {
    // Ignore file write errors
  }

  // Don't exit - allow the server to continue running
})

// Catch SIGPIPE errors (common on Linux when clients disconnect abruptly)
process.on('SIGPIPE', () => {
  console.log('[CRASH-GUARD] SIGPIPE received (client disconnected), ignoring')
})

// =============================================================================

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || '0.0.0.0' // 0.0.0.0 allows network access
const port = parseInt(process.env.PORT || '23000', 10)

// Server mode: 'full' (default) = Next.js + UI, 'headless' = API-only (no Next.js)
const MAESTRO_MODE = process.env.MAESTRO_MODE || 'full'

// Global logging master switch - set ENABLE_LOGGING=true to enable all logging
const globalLoggingEnabled = process.env.ENABLE_LOGGING === 'true'

// Session state management
// sessionActivity, terminalSessions, statusSubscribers, companionClients, broadcastStatusUpdate
// are imported from shared-state-bridge.mjs (backed by globalThis._sharedState)
const idleTimers = new Map() // sessionName -> { timer, wasActive }

// Idle threshold in milliseconds (30 seconds)
const IDLE_THRESHOLD_MS = 30 * 1000

// PTY cleanup grace period (30 seconds)
const PTY_CLEANUP_GRACE_MS = 30 * 1000

// Periodic orphaned PTY cleanup interval (5 minutes)
const ORPHAN_CLEANUP_INTERVAL_MS = 5 * 60 * 1000

/**
 * Safely kill a PTY process
 * Based on node-pty best practices from GitHub issues #333, #382
 *
 * Key learnings:
 * - Use ptyProcess.kill() first (not process.kill)
 * - Wrap in try-catch because killing already-dead process throws
 * - Use SIGKILL as fallback after timeout
 * - Process group kill (-pid) is unreliable with node-pty
 *
 * @returns true if kill was attempted, false if process was already dead
 */
function killPtyProcess(ptyProcess, sessionName, alreadyExited = false) {
  if (!ptyProcess) {
    return false
  }

  // If process already exited via onExit, don't try to kill again
  if (alreadyExited) {
    console.log(`[PTY] Skipping kill for ${sessionName} - already exited`)
    return true
  }

  const pid = ptyProcess.pid
  if (!pid) {
    return false
  }

  console.log(`[PTY] Killing PTY for ${sessionName} (pid: ${pid})`)

  // Method 1: Use node-pty's kill() - recommended approach
  // This properly handles the underlying PTY cleanup
  try {
    ptyProcess.kill()
    console.log(`[PTY] Sent SIGTERM to ${sessionName} via ptyProcess.kill()`)
  } catch (e) {
    // Process might already be dead - this is expected
    console.log(`[PTY] ptyProcess.kill() failed for ${sessionName}: ${e.message}`)
  }

  // Schedule a SIGKILL as a fallback if SIGTERM didn't work
  // This ensures we don't leave zombie processes
  setTimeout(() => {
    try {
      // Check if process still exists (signal 0 just checks existence)
      process.kill(pid, 0)
      // Still alive after 3 seconds, force kill
      console.log(`[PTY] Force killing ${sessionName} (pid: ${pid}) - SIGTERM didn't work`)
      try {
        ptyProcess.kill('SIGKILL')
      } catch (e) {
        // Fallback to process.kill if ptyProcess.kill fails
        try { process.kill(pid, 'SIGKILL') } catch (e2) {}
      }
    } catch (e) {
      // Process doesn't exist anymore - good!
    }
  }, 3000)

  return true
}

/**
 * Clean up a session's PTY and resources
 * Called when last client disconnects, on error, or when PTY exits
 *
 * @param sessionName - Name of the session
 * @param sessionState - Session state object (optional, will lookup if null)
 * @param reason - Reason for cleanup (for logging)
 * @param ptyAlreadyExited - If true, PTY has already exited (don't try to kill)
 */
function cleanupSession(sessionName, sessionState, reason = 'unknown', ptyAlreadyExited = false) {
  if (!sessionState) {
    sessionState = terminalSessions.get(sessionName)
  }
  if (!sessionState) {
    return
  }

  // Prevent double cleanup
  if (sessionState.cleanedUp) {
    console.log(`[PTY] Session ${sessionName} already cleaned up, skipping`)
    return
  }
  sessionState.cleanedUp = true

  console.log(`[PTY] Cleaning up session ${sessionName} (reason: ${reason}, ptyExited: ${ptyAlreadyExited})`)

  // Clear any pending cleanup timer
  if (sessionState.cleanupTimer) {
    clearTimeout(sessionState.cleanupTimer)
    sessionState.cleanupTimer = null
  }

  // Close log stream
  if (sessionState.logStream) {
    try {
      sessionState.logStream.end()
    } catch (e) {
      // Ignore
    }
  }

  // Kill the PTY process (skip if it already exited)
  if (sessionState.ptyProcess) {
    killPtyProcess(sessionState.ptyProcess, sessionName, ptyAlreadyExited)
  }

  // Close all remaining client connections
  if (sessionState.clients) {
    sessionState.clients.forEach((client) => {
      try {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.close(1000, 'Session cleaned up')
        }
      } catch (e) {
        // Ignore close errors
      }
    })
    sessionState.clients.clear()
  }

  // Remove from terminal sessions map
  terminalSessions.delete(sessionName)

  // Clean up activity tracking
  sessionActivity.delete(sessionName)
  const idleTimer = idleTimers.get(sessionName)
  if (idleTimer?.timer) {
    clearTimeout(idleTimer.timer)
  }
  idleTimers.delete(sessionName)

  console.log(`[PTY] Session ${sessionName} cleaned up. Active sessions: ${terminalSessions.size}`)
}

/**
 * Handle client removal from a session
 * Schedules cleanup if no clients remain
 */
function handleClientDisconnect(ws, sessionName, sessionState, reason = 'close') {
  if (!sessionState) return

  // Remove this client
  sessionState.clients.delete(ws)

  console.log(`[PTY] Client disconnected from ${sessionName} (${reason}). Remaining clients: ${sessionState.clients.size}`)

  // If no clients remain, schedule cleanup
  if (sessionState.clients.size === 0) {
    console.log(`[PTY] Last client disconnected from ${sessionName}, scheduling cleanup in ${PTY_CLEANUP_GRACE_MS / 1000}s`)

    // Clear any existing cleanup timer
    if (sessionState.cleanupTimer) {
      clearTimeout(sessionState.cleanupTimer)
    }

    // Schedule cleanup after grace period
    sessionState.cleanupTimer = setTimeout(() => {
      // Double-check no clients reconnected
      if (sessionState.clients.size === 0) {
        cleanupSession(sessionName, sessionState, 'no_clients_after_grace_period')
      }
    }, PTY_CLEANUP_GRACE_MS)
  }
}

/**
 * Periodic cleanup of orphaned sessions
 * Runs every ORPHAN_CLEANUP_INTERVAL_MS to catch any leaked PTYs
 */
function startOrphanedPtyCleanup() {
  setInterval(() => {
    let orphanedCount = 0

    terminalSessions.forEach((sessionState, sessionName) => {
      // Skip if already cleaned up or being cleaned up
      if (sessionState.cleanedUp) {
        return
      }

      // Check for sessions with no clients and no pending cleanup timer
      // These are orphaned - they have a PTY but no way to clean it up
      if (sessionState.clients.size === 0 && !sessionState.cleanupTimer) {
        console.log(`[PTY] Found orphaned session: ${sessionName}`)
        cleanupSession(sessionName, sessionState, 'orphan_cleanup', false)
        orphanedCount++
      }
    })

    if (orphanedCount > 0) {
      console.log(`[PTY] Cleaned up ${orphanedCount} orphaned session(s). Active: ${terminalSessions.size}`)
    }
  }, ORPHAN_CLEANUP_INTERVAL_MS)

  console.log(`[PTY] Orphaned PTY cleanup scheduled every ${ORPHAN_CLEANUP_INTERVAL_MS / 1000}s`)
}

/**
 * Get agentId for a session
 *
 * Session names follow the pattern: agentId@hostId (like email)
 * - For local sessions: the session name IS the agentId (e.g., "my-agent")
 * - For structured sessions: "my-agent@local" or "my-agent@remote1"
 *
 * We verify the agent exists by checking if its database directory exists.
 */
function getAgentIdForSession(sessionName) {
  try {
    // Parse session name to extract agentId
    // Format: agentId@hostId or just agentId for legacy
    const atIndex = sessionName.indexOf('@')
    const agentId = atIndex > 0 ? sessionName.substring(0, atIndex) : sessionName

    // Verify the agent database directory exists
    const agentDbPath = path.join(os.homedir(), '.aimaestro', 'agents', agentId)
    if (fs.existsSync(agentDbPath) && fs.statSync(agentDbPath).isDirectory()) {
      return agentId
    }
  } catch {
    // Agent directory doesn't exist or error accessing it
  }
  return null
}

/**
 * Track session activity and detect idle transitions
 * Sends host hints to agents when session goes idle
 */
function trackSessionActivity(sessionName) {
  const now = Date.now()
  const previousActivity = sessionActivity.get(sessionName)
  const previousState = idleTimers.get(sessionName)

  // Update activity timestamp
  sessionActivity.set(sessionName, now)

  // Clear existing idle timer
  if (previousState?.timer) {
    clearTimeout(previousState.timer)
  }

  // Schedule idle transition check
  const timer = setTimeout(() => {
    // Check if still idle (no new activity since timer was set)
    const currentActivity = sessionActivity.get(sessionName)
    if (currentActivity && now === currentActivity) {
      // Session went idle - notify agent via host hints
      const agentId = getAgentIdForSession(sessionName)
      if (agentId) {
        console.log(`[IdleDetect] Session ${sessionName} went idle, notifying agent ${agentId.substring(0, 8)}`)
        hostHints.notifyIdleTransition(agentId)
      }
    }
    // Update state to reflect idle
    idleTimers.set(sessionName, { timer: null, wasActive: false })
  }, IDLE_THRESHOLD_MS)

  // Update idle timer state
  idleTimers.set(sessionName, { timer, wasActive: true })
}

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// statusSubscribers, broadcastStatusUpdate imported from shared-state-bridge.mjs

/**
 * Start the HTTP server with the given request handler.
 * All WebSocket servers, PTY handling, startup tasks, and graceful shutdown
 * are shared between full and headless modes.
 */
async function startServer(handleRequest) {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)

      // Internal endpoint for PTY debug info - served directly from server.mjs
      // This allows access to the in-memory sessions map
      if (parsedUrl.pathname === '/api/internal/pty-sessions') {
        res.setHeader('Content-Type', 'application/json')
        const sessionInfo = []
        terminalSessions.forEach((state, name) => {
          sessionInfo.push({
            name,
            clients: state.clients?.size || 0,
            hasPty: !!state.ptyProcess,
            pid: state.ptyProcess?.pid || null,
            hasCleanupTimer: !!state.cleanupTimer,
            lastActivity: sessionActivity.get(name) || null
          })
        })
        res.end(JSON.stringify({
          activeSessions: terminalSessions.size,
          sessions: sessionInfo,
          timestamp: new Date().toISOString()
        }))
        return
      }

      await handleRequest(req, res, parsedUrl)
    } catch (err) {
      console.error('Error handling request:', err)
      res.statusCode = 500
      res.end('Internal server error')
    }
  })

  // WebSocket server for terminal connections
  const wss = new WebSocketServer({ noServer: true })

  // Handle remote worker connections (proxy WebSocket to remote host)
  // With retry logic for flaky networks
  function handleRemoteWorker(clientWs, sessionName, workerUrl) {
    const MAX_RETRIES = 5
    const RETRY_DELAYS = [500, 1000, 2000, 3000, 5000] // Exponential backoff
    let retryCount = 0
    let workerWs = null
    let clientClosed = false

    // Build WebSocket URL for remote worker
    const workerWsUrl = `${workerUrl}/term?name=${encodeURIComponent(sessionName)}`
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:')

    // Send status message to client
    function sendStatus(message, type = 'info') {
      if (clientWs.readyState === 1) {
        try {
          clientWs.send(JSON.stringify({ type: 'status', message, statusType: type }))
        } catch (e) {
          // Ignore send errors
        }
      }
    }

    // Attempt connection with retry
    function attemptConnection() {
      if (clientClosed) {
        console.log(`🌐 [REMOTE] Client closed, aborting connection to ${sessionName}`)
        return
      }

      if (retryCount > 0) {
        console.log(`🌐 [REMOTE] Retry ${retryCount}/${MAX_RETRIES} connecting to ${workerUrl}`)
        sendStatus(`Retrying connection (${retryCount}/${MAX_RETRIES})...`, 'warning')
      } else {
        console.log(`🌐 [REMOTE] Connecting to remote worker: ${workerUrl}`)
        sendStatus('Connecting to remote host...', 'info')
      }

      workerWs = new WebSocket(workerWsUrl)

      // Set connection timeout
      const connectionTimeout = setTimeout(() => {
        if (workerWs.readyState === WebSocket.CONNECTING) {
          console.log(`🌐 [REMOTE] Connection timeout for ${sessionName}`)
          workerWs.terminate()
        }
      }, 10000) // 10 second timeout

      workerWs.on('open', () => {
        clearTimeout(connectionTimeout)
        console.log(`🌐 [REMOTE] Connected to ${sessionName} at ${workerUrl}`)
        sendStatus('Connected to remote host', 'success')

        // Reset retry count on successful connection
        retryCount = 0

        // Track activity for remote sessions
        sessionActivity.set(sessionName, Date.now())

        // Proxy messages: browser → remote worker
        clientWs.on('message', (data) => {
          if (workerWs.readyState === WebSocket.OPEN) {
            workerWs.send(data)
          }
        })

        // Proxy messages: remote worker → browser
        workerWs.on('message', (data) => {
          // Convert Buffer to string if needed
          const dataStr = typeof data === 'string' ? data : data.toString('utf8')

          if (clientWs.readyState === 1) { // WebSocket.OPEN
            // Send as string (browser expects string)
            clientWs.send(dataStr)

            // Track activity when worker sends data
            if (dataStr.length >= 3) {
              sessionActivity.set(sessionName, Date.now())
            }
          }
        })

        // Handle remote worker disconnection
        workerWs.on('close', (code, reason) => {
          console.log(`🌐 [REMOTE] Worker disconnected: ${sessionName} (${code}: ${reason})`)
          if (clientWs.readyState === 1) {
            clientWs.close(1000, 'Remote worker disconnected')
          }
        })

        workerWs.on('error', (error) => {
          console.error(`🌐 [REMOTE] Error from ${sessionName}:`, error.message)
          if (clientWs.readyState === 1) {
            clientWs.close(1011, 'Remote worker error')
          }
        })

        // Handle client disconnection
        clientWs.on('close', () => {
          clientClosed = true
          console.log(`🌐 [REMOTE] Client disconnected from ${sessionName}`)
          if (workerWs.readyState === WebSocket.OPEN) {
            workerWs.close()
          }
        })

        clientWs.on('error', (error) => {
          clientClosed = true
          console.error(`🌐 [REMOTE] Client error for ${sessionName}:`, error.message)
          if (workerWs.readyState === WebSocket.OPEN) {
            workerWs.close()
          }
        })
      })

      workerWs.on('error', (error) => {
        clearTimeout(connectionTimeout)
        console.error(`🌐 [REMOTE] Failed to connect to ${workerUrl}:`, error.message)

        // Retry if we haven't exceeded max retries
        if (retryCount < MAX_RETRIES && !clientClosed) {
          const delay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1]
          retryCount++
          sendStatus(`Connection failed, retrying in ${delay / 1000}s...`, 'warning')
          setTimeout(attemptConnection, delay)
        } else {
          const errorMsg = retryCount >= MAX_RETRIES
            ? `Cannot connect after ${MAX_RETRIES} retries - network may be unstable`
            : `Cannot connect to remote worker: ${error.message}`
          console.error(`🌐 [REMOTE] Giving up on ${sessionName}: ${errorMsg}`)
          sendStatus(errorMsg, 'error')
          if (clientWs.readyState === 1) {
            // Use code 4000 to signal permanent failure - client should NOT retry
            clientWs.close(4000, errorMsg)
          }
        }
      })
    }

    // Handle early client disconnection
    clientWs.on('close', () => {
      clientClosed = true
      if (workerWs && workerWs.readyState === WebSocket.CONNECTING) {
        workerWs.terminate()
      }
    })

    // Start connection attempt
    attemptConnection()
  }

  // NOTE: Container agent handling removed - not yet implemented
  // Future: Add handleContainerAgent() when cloud deployment is supported

  // WebSocket server for AMP real-time delivery (/v1/ws)
  const ampWss = new WebSocketServer({ noServer: true })

  ampWss.on('connection', async (ws) => {
    try {
      // Dynamically import the AMP WebSocket handler (compiled from TypeScript)
      const { handleAMPWebSocket } = await import('./lib/amp-websocket.ts')
      handleAMPWebSocket(ws)
    } catch (err) {
      console.error('[AMP-WS] Failed to load handler:', err)
      ws.close(1011, 'Internal error')
    }
  })

  // WebSocket server for status updates
  const statusWss = new WebSocketServer({ noServer: true })

  statusWss.on('connection', async (ws) => {
    console.log('[STATUS-WS] Client connected')
    statusSubscribers.add(ws)

    // Send current status to new subscriber (including hook states)
    try {
      const response = await fetch(`http://localhost:${port}/api/sessions/activity`)
      const data = await response.json()
      ws.send(JSON.stringify({ type: 'initial_status', activity: data.activity || {} }))
    } catch (err) {
      console.error('[STATUS-WS] Failed to fetch initial status:', err)
      // Fallback to basic activity
      const currentStatus = {}
      sessionActivity.forEach((timestamp, sessionName) => {
        currentStatus[sessionName] = {
          lastActivity: new Date(timestamp).toISOString(),
          status: (Date.now() - timestamp) / 1000 > 3 ? 'idle' : 'active'
        }
      })
      ws.send(JSON.stringify({ type: 'initial_status', activity: currentStatus }))
    }

    ws.on('close', () => {
      console.log('[STATUS-WS] Client disconnected')
      statusSubscribers.delete(ws)
    })

    ws.on('error', (err) => {
      console.error('[STATUS-WS] Error:', err)
      statusSubscribers.delete(ws)
    })
  })

  // WebSocket server for companion speech events (/companion-ws)
  const companionWss = new WebSocketServer({ noServer: true })

  // companionClients imported from shared-state-bridge.mjs

  companionWss.on('connection', async (ws, query) => {
    const agentId = query.agent
    if (!agentId || typeof agentId !== 'string') {
      ws.close(1008, 'agent parameter required')
      return
    }

    console.log(`[COMPANION-WS] Client connected for agent ${agentId.substring(0, 8)}`)

    // Add to subscribers for this agent
    let clients = companionClients.get(agentId)
    if (!clients) {
      clients = new Set()
      companionClients.set(agentId, clients)
    }
    clients.add(ws)

    // Notify cerebellum that companion connected
    try {
      const { agentRegistry } = await import('./lib/agent.ts')
      const agent = agentRegistry.getExistingAgent(agentId)
      if (agent) {
        const cerebellum = agent.getCerebellum()
        if (cerebellum) {
          cerebellum.setCompanionConnected(true)

          // Subscribe to voice:speak events for this agent
          const listener = (event) => {
            if (event.type === 'voice:speak' && event.agentId === agentId) {
              const message = JSON.stringify({
                type: 'speech',
                text: event.payload?.text || '',
                timestamp: Date.now(),
              })
              // Send to all companion clients for this agent
              const agentClients = companionClients.get(agentId)
              if (agentClients) {
                for (const client of agentClients) {
                  if (client.readyState === 1) { // WebSocket.OPEN
                    try { client.send(message) } catch { /* ignore */ }
                  }
                }
              }
            }
          }
          cerebellum.on('voice:speak', listener)

          // Also attach the voice subsystem to the terminal buffer if available
          const voiceSub = cerebellum.getSubsystem('voice')
          if (voiceSub && voiceSub.attachBuffer) {
            const { getBuffer } = await import('./lib/cerebellum/session-bridge.mjs')
            // Find the session name for this agent
            const { getAgent: getRegistryAgent } = await import('./lib/agent-registry.ts')
            const registryAgent = getRegistryAgent(agentId)
            const sessionName = registryAgent?.name || registryAgent?.alias
            if (sessionName) {
              const buffer = getBuffer(sessionName)
              if (buffer) {
                voiceSub.attachBuffer(buffer)
                console.log(`[COMPANION-WS] Attached voice buffer for session ${sessionName}`)
              }
            }
          }

          // Store cleanup info on the ws
          ws._companionCleanup = { listener, agentId }
        }
      }
    } catch (err) {
      console.error('[COMPANION-WS] Error setting up cerebellum connection:', err)
    }

    // Handle user messages forwarded from the companion UI
    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString())
        if (data.type === 'user_message' && typeof data.text === 'string') {
          // Forward to voice subsystem's user message buffer
          import('./lib/agent.ts').then(({ agentRegistry }) => {
            const agent = agentRegistry.getExistingAgent(agentId)
            const cerebellum = agent?.getCerebellum()
            if (cerebellum) {
              const voiceSub = cerebellum.getSubsystem('voice')
              if (voiceSub?.addUserMessage) {
                voiceSub.addUserMessage(data.text)
              }
            }
          }).catch(() => { /* ignore */ })
        } else if (data.type === 'repeat') {
          // Repeat the last spoken message
          import('./lib/agent.ts').then(({ agentRegistry }) => {
            const agent = agentRegistry.getExistingAgent(agentId)
            const cerebellum = agent?.getCerebellum()
            if (cerebellum) {
              const voiceSub = cerebellum.getSubsystem('voice')
              if (voiceSub?.repeatLast) {
                voiceSub.repeatLast()
              }
            }
          }).catch(() => { /* ignore */ })
        }
      } catch {
        // Ignore non-JSON messages
      }
    })

    ws.on('close', () => {
      console.log(`[COMPANION-WS] Client disconnected from agent ${agentId.substring(0, 8)}`)
      const agentClients = companionClients.get(agentId)
      if (agentClients) {
        agentClients.delete(ws)
        if (agentClients.size === 0) {
          companionClients.delete(agentId)
          // Notify cerebellum no companion connected
          import('./lib/agent.ts').then(({ agentRegistry }) => {
            const agent = agentRegistry.getExistingAgent(agentId)
            const cerebellum = agent?.getCerebellum()
            if (cerebellum) {
              cerebellum.setCompanionConnected(false)
              // Clean up listener
              if (ws._companionCleanup?.listener) {
                cerebellum.off('voice:speak', ws._companionCleanup.listener)
              }
            }
          }).catch(() => { /* ignore */ })
        }
      }
    })

    ws.on('error', (err) => {
      console.error('[COMPANION-WS] Error:', err.message)
    })
  })

  server.on('upgrade', (request, socket, head) => {
    const { pathname, query } = parse(request.url, true)

    if (pathname === '/term') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, query)
      })
    } else if (pathname === '/status') {
      statusWss.handleUpgrade(request, socket, head, (ws) => {
        statusWss.emit('connection', ws)
      })
    } else if (pathname === '/v1/ws') {
      ampWss.handleUpgrade(request, socket, head, (ws) => {
        ampWss.emit('connection', ws)
      })
    } else if (pathname === '/companion-ws') {
      companionWss.handleUpgrade(request, socket, head, (ws) => {
        companionWss.emit('connection', ws, query)
      })
    } else {
      socket.destroy()
    }
  })

  wss.on('connection', async (ws, request, query) => {
    const sessionName = query.name

    if (!sessionName || typeof sessionName !== 'string') {
      ws.close(1008, 'Session name required')
      return
    }

    // Check if this is a remote host connection
    if (query.host && typeof query.host === 'string') {
      try {
        const host = getHostById(query.host)

        if (!host) {
          console.error(`🌐 [REMOTE] Host not found: ${query.host}`)
          ws.close(1008, `Host not found: ${query.host}`)
          return
        }

        // Use isSelf() to determine if this is a local or remote host
        // This is more reliable than checking host.type which may be undefined
        if (!isSelf(host.id)) {
          console.log(`🌐 [REMOTE] Routing ${sessionName} to host ${host.id} (${host.url})`)
          handleRemoteWorker(ws, sessionName, host.url)
          return
        }
        // If isSelf(host.id) is true, fall through to local tmux handling
      } catch (error) {
        console.error(`🌐 [REMOTE] Error routing to remote host:`, error)
        ws.close(1011, 'Remote host routing error')
        return
      }
    }

    // NOTE: Container/cloud agent routing is not yet implemented
    // Future: Check agent metadata for cloud deployment and proxy to container WebSocket
    // Currently all agents are local tmux sessions

    // Get or create session state (for traditional local tmux sessions)
    let sessionState = terminalSessions.get(sessionName)

    if (!sessionState) {
      let ptyProcess

      // Spawn PTY with tmux attach, with retry logic for transient failures.
      // Race condition: when a previous PTY cleanup just ran (30s grace period expired),
      // tmux may still be detaching. Retrying after a short delay resolves this.
      const PTY_SPAWN_MAX_RETRIES = 3
      const PTY_SPAWN_RETRY_DELAY_MS = 500
      const socketPath = query.socket || undefined

      for (let attempt = 1; attempt <= PTY_SPAWN_MAX_RETRIES; attempt++) {
        try {
          // Verify tmux session exists before attempting to attach
          if (attempt === 1) {
            const { sessionExistsSync } = await import('./lib/agent-runtime.ts')
            if (!sessionExistsSync(sessionName, socketPath)) {
              // tmux session does not exist
              console.error(`[PTY] tmux session "${sessionName}" does not exist`)
              try {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: `Failed to attach to session "${sessionName}". Make sure tmux is installed and the session exists.`,
                  details: 'tmux session not found'
                }))
              } catch (sendError) { /* ignore */ }
              ws.close(1011, `tmux session not found: ${sessionName}`)
              return
            }
          }

          const { getRuntime: getRt } = await import('./lib/agent-runtime.ts')
          const { command: attachCmd, args: attachArgs } = getRt().getAttachCommand(sessionName, socketPath)
          ptyProcess = pty.spawn(attachCmd, attachArgs, {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: process.env.HOME || process.cwd(),
            env: process.env
          })
          break // Success, exit retry loop
        } catch (spawnError) {
          console.error(`[PTY] Spawn attempt ${attempt}/${PTY_SPAWN_MAX_RETRIES} failed for ${sessionName}:`, spawnError.message)

          if (attempt < PTY_SPAWN_MAX_RETRIES) {
            // Wait before retrying -- tmux may still be detaching from previous PTY
            await new Promise(resolve => setTimeout(resolve, PTY_SPAWN_RETRY_DELAY_MS))

            // Check if another client already created the session state while we waited
            sessionState = terminalSessions.get(sessionName)
            if (sessionState) {
              console.log(`[PTY] Session ${sessionName} was created by another client during retry, reusing`)
              break
            }
          } else {
            // All retries exhausted
            try {
              ws.send(JSON.stringify({
                type: 'error',
                message: `Failed to attach to session "${sessionName}". Make sure tmux is installed and the session exists.`,
                details: spawnError.message
              }))
            } catch (sendError) { /* ignore */ }
            ws.close(1011, `PTY spawn failed: ${spawnError.message}`)
            return
          }
        }
      }

      // If another client created session state during retry, skip creation
      if (sessionState) {
        // Fall through to add client to existing session
      } else if (!ptyProcess) {
        // Should not happen, but guard against it
        ws.close(1011, 'PTY spawn failed unexpectedly')
        return
      } else {

      // Create log file for this session (only if global logging is enabled)
      let logStream = null
      if (globalLoggingEnabled) {
        const logFilePath = path.join(logsDir, `${sessionName}.txt`)
        logStream = fs.createWriteStream(logFilePath, { flags: 'a' }) // 'a' for append mode
      }

      sessionState = {
        clients: new Set(),
        ptyProcess,
        logStream,
        loggingEnabled: true, // Default to enabled (but only works if globalLoggingEnabled is true)
        cleanupTimer: null, // Timer for cleaning up PTY when no clients connected
        terminalBuffer: getOrCreateBuffer(sessionName) // Cerebellum terminal buffer for voice subsystem
      }
      terminalSessions.set(sessionName, sessionState)

      // Stream PTY output to all clients with flow control (backpressure)
      // This prevents overwhelming xterm.js with too much data at once
      ptyProcess.onData((data) => {
        // Pause PTY to implement backpressure
        ptyProcess.pause()

        // Check if this is a redraw/status update we should filter from logs
        const cleanedData = data.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') // Remove all ANSI codes

        // Detect Claude Code status patterns and thinking steps
        const isStatusPattern =
          /[✳·]\s*\w+ing[\.…]/.test(cleanedData) || // "✳ Forming...", "· Thinking…", etc.
          cleanedData.includes('esc to interrupt') ||
          cleanedData.includes('? for shortcuts') ||
          /Tip:/.test(cleanedData) ||
          /^[─>]+\s*$/.test(cleanedData.replace(/[\r\n]/g, '')) || // Just border characters
          /\[\d+\/\d+\]/.test(cleanedData) || // Thinking step markers like [1/418], [2/418]
          /^\d{2}:\d{2}:\d{2}\s+\[\d+\/\d+\]/.test(cleanedData) // Timestamped steps like "15:34:46 [1/418]"

        // Write to log file only if global logging is enabled, session logging is enabled, and it's not a status pattern
        if (globalLoggingEnabled && sessionState.logStream && sessionState.loggingEnabled && !isStatusPattern) {
          try {
            sessionState.logStream.write(data)
          } catch (error) {
            console.error(`Error writing to log file for session ${sessionName}:`, error)
          }
        }

        // Track substantial activity (filter out cursor blinks and pure escape sequences)
        const hasSubstantialContent = data.length >= 3 &&
          !(data.startsWith('\x1b') && !/[\x20-\x7E]/.test(data))

        if (hasSubstantialContent) {
          trackSessionActivity(sessionName)
        }

        // Feed data to cerebellum terminal buffer (for voice subsystem)
        if (sessionState.terminalBuffer && hasSubstantialContent) {
          sessionState.terminalBuffer.write(data)
        }

        // Send data to all clients and wait for write completion
        const writePromises = []
        sessionState.clients.forEach((client) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            writePromises.push(
              new Promise((resolve) => {
                try {
                  // WebSocket.send() is synchronous, but we wrap it to handle errors
                  client.send(data, (error) => {
                    if (error) {
                      console.error('Error sending data to client:', error)
                    }
                    resolve()
                  })
                } catch (error) {
                  console.error('Error sending data to client:', error)
                  resolve()
                }
              })
            )
          }
        })

        // Resume PTY after all clients have received the data
        Promise.all(writePromises).finally(() => {
          ptyProcess.resume()
        })
      })

      ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(`[PTY] Process exited for ${sessionName} (code: ${exitCode}, signal: ${signal})`)
        // Pass ptyAlreadyExited=true since the process has already terminated
        cleanupSession(sessionName, sessionState, `pty_exit_${exitCode || signal}`, true)
      })
      }
    }

    // Add client to session
    sessionState.clients.add(ws)

    // Track connection as activity (so newly opened sessions show as active)
    trackSessionActivity(sessionName)
    console.log(`[ACTIVITY-TRACK] Set activity for ${sessionName}, map size: ${sessionActivity.size}`)

    // If there was a cleanup timer scheduled, cancel it (client reconnected)
    if (sessionState.cleanupTimer) {
      console.log(`Client reconnected to ${sessionName}, canceling cleanup`)
      clearTimeout(sessionState.cleanupTimer)
      sessionState.cleanupTimer = null
    }

    // Send scrollback history to new clients - ASYNC to avoid blocking the event loop
    // The client can start typing immediately; history loads in the background
    setTimeout(async () => {
      try {
        const { getRuntime: getRt } = await import('./lib/agent-runtime.ts')
        const runtime = getRt()

        let historyContent = ''
        try {
          // Capture scrollback history (up to 2000 lines) WITHOUT escape sequences
          // Reduced from 5000 to 2000 for faster loading
          historyContent = await runtime.capturePane(sessionName, 2000)
        } catch (historyError) {
          console.error('Failed to capture history:', historyError)
        }

        if (ws.readyState === 1) {
          if (historyContent) {
            // Send with proper line endings
            const formattedHistory = historyContent.replace(/\n/g, '\r\n')
            ws.send(formattedHistory)
          }
          ws.send(JSON.stringify({ type: 'history-complete' }))
        }
      } catch (error) {
        console.error('Error capturing terminal history:', error)
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'history-complete' }))
        }
      }
    }, 100)

    // Handle client input
    ws.on('message', (data) => {
      try {
        const message = data.toString()

        // Check if it's a JSON message (for resize events, logging control, etc.)
        try {
          const parsed = JSON.parse(message)

          if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
            sessionState.ptyProcess.resize(parsed.cols, parsed.rows)
            return
          }

          if (parsed.type === 'set-logging') {
            sessionState.loggingEnabled = parsed.enabled
            console.log(`Logging ${parsed.enabled ? 'enabled' : 'disabled'} for session: ${sessionName}`)
            return
          }
        } catch {
          // Not JSON, treat as raw input
        }

        // Send input to PTY
        sessionState.ptyProcess.write(message)
      } catch (error) {
        console.error('Error processing message:', error)
      }
    })

    // Handle client disconnect
    ws.on('close', () => {
      handleClientDisconnect(ws, sessionName, sessionState, 'close')
    })

    // Handle WebSocket errors - MUST also trigger cleanup
    ws.on('error', (error) => {
      console.error(`[PTY] WebSocket error for ${sessionName}:`, error.message)
      handleClientDisconnect(ws, sessionName, sessionState, 'error')
    })
  })

  // Increase server timeout for long-running operations like doc indexing
  // Default is 120000 (2 min), we set to 15 minutes
  server.timeout = 15 * 60 * 1000
  server.keepAliveTimeout = 15 * 60 * 1000
  server.headersTimeout = 15 * 60 * 1000 + 1000

  server.listen(port, hostname, async () => {
    console.log(`> Ready on http://${hostname}:${port}`)

    // Sync agent databases on startup
    try {
      const { syncAgentDatabases } = await import('./lib/agent-db-sync.mjs')
      await syncAgentDatabases()
    } catch (error) {
      console.error('[DB-SYNC] Failed to sync agent databases on startup:', error)
    }

    // Normalize agent hostIds on startup (Phase 1: AMP Protocol Fix)
    // This ensures all agents have canonical hostIds for proper AMP addressing
    setTimeout(async () => {
      try {
        const response = await fetch(`http://localhost:${port}/api/agents/normalize-hosts`, {
          method: 'POST',
          signal: AbortSignal.timeout(10000)
        })
        if (response.ok) {
          const result = await response.json()
          if (result.result?.updated > 0) {
            console.log(`[Host ID Normalization] Fixed ${result.result.updated} agent(s) with inconsistent hostIds`)
          }
        }
      } catch (error) {
        console.error('[Host ID Normalization] Startup normalization failed:', error.message)
      }
    }, 2000) // Run after 2 seconds to ensure routes are ready

    // Sync agent directory with peers on startup (Phase 3: AMP Protocol Fix)
    setTimeout(async () => {
      try {
        const response = await fetch(`http://localhost:${port}/api/agents/directory/sync`, {
          method: 'POST',
          signal: AbortSignal.timeout(30000)  // 30s timeout for sync
        })
        if (response.ok) {
          const result = await response.json()
          if (result.result?.newAgents > 0) {
            console.log(`[Agent Directory] Startup sync: discovered ${result.result.newAgents} new agent(s)`)
          }
        }
      } catch (error) {
        console.error('[Agent Directory] Startup sync failed:', error.message)
      }
    }, 5000) // Run after 5 seconds (after host sync has a chance to complete)

    // Sync with remote hosts on startup (register ourselves with known peers)
    setTimeout(async () => {
      try {
        const hostsResponse = await fetch(`http://localhost:${port}/api/hosts`)
        const hostsData = await hostsResponse.json()
        const remoteHosts = (hostsData.hosts || []).filter(h => h.type === 'remote' && h.enabled)

        if (remoteHosts.length > 0) {
          console.log(`[Host Sync] Registering with ${remoteHosts.length} remote host(s) on startup...`)

          const selfResponse = await fetch(`http://localhost:${port}/api/hosts/identity`)
          const selfData = await selfResponse.json()

          for (const host of remoteHosts) {
            try {
              const response = await fetch(`${host.url}/api/hosts/register-peer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  host: selfData.host,
                  source: { initiator: selfData.host.id, timestamp: new Date().toISOString() }
                }),
                signal: AbortSignal.timeout(10000)
              })

              if (response.ok) {
                const result = await response.json()
                console.log(`[Host Sync] Registered with ${host.name}: ${result.alreadyKnown ? 'already known' : 'newly registered'}`)
              } else {
                console.log(`[Host Sync] Failed to register with ${host.name}: HTTP ${response.status}`)
              }
            } catch (error) {
              console.log(`[Host Sync] Could not reach ${host.name}: ${error.message}`)
            }
          }
        }
      } catch (error) {
        console.error('[Host Sync] Startup peer sync failed:', error.message)
      }
    }, 5000) // Wait 5 seconds for server to fully initialize

    // Agent initialization on startup is DISABLED to avoid CPU spike
    // Agents will be initialized on-demand when accessed via API
    // The subconscious processes will start when an agent is first accessed
    // To manually trigger indexing, call /api/agents/{id}/index-delta
    console.log('[AgentStartup] Startup indexing disabled - agents will initialize on-demand')

    // Start periodic orphaned PTY cleanup to prevent leaks
    startOrphanedPtyCleanup()
  })

  // Graceful shutdown - kill PTYs FIRST before closing server
  const gracefulShutdown = (signal) => {
    console.log(`[Server] Received ${signal}, shutting down gracefully...`)

    // Kill all PTY processes FIRST and synchronously
    const sessionCount = terminalSessions.size
    console.log(`[Server] Cleaning up ${sessionCount} PTY sessions...`)

    terminalSessions.forEach((state, sessionName) => {
      // Close log stream
      if (state.logStream) {
        try {
          state.logStream.end()
        } catch (e) {
          // Ignore
        }
      }
      // Kill PTY process only (NOT the process group — that kills tmux sessions)
      if (state.ptyProcess && state.ptyProcess.pid) {
        const pid = state.ptyProcess.pid
        console.log(`[Server] Killing PTY for ${sessionName} (pid: ${pid})`)
        try {
          // Use node-pty's kill with SIGTERM to let tmux detach cleanly
          state.ptyProcess.kill()
        } catch (e) {
          try {
            // Fallback to direct SIGTERM on the process
            process.kill(pid, 'SIGTERM')
          } catch (e2) {
            console.error(`[Server] Failed to kill PTY ${sessionName}:`, e2.message)
          }
        }
      }
    })

    // Clear the terminal sessions map
    terminalSessions.clear()
    console.log(`[Server] PTY cleanup complete`)

    // Now close the server
    server.close(() => {
      console.log('[Server] Shutdown complete')
      process.exit(0)
    })

    // Force exit after 5 seconds if server.close() hangs
    setTimeout(() => {
      console.log('[Server] Forced exit after timeout')
      process.exit(0)
    }, 5000)
  }

  // Handle both SIGTERM and SIGINT
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
}

// =============================================================================
// MODE BRANCHING: full (Next.js + UI) vs headless (API-only)
// =============================================================================

if (MAESTRO_MODE === 'headless') {
  // Headless mode: standalone HTTP router, no Next.js
  import('./services/headless-router.ts').then(({ createHeadlessRouter }) => {
    const router = createHeadlessRouter()

    startServer(async (req, res, _parsedUrl) => {
      const handled = await router.handle(req, res)
      if (!handled) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Not found' }))
      }
    })

    console.log(`> Headless mode (API-only, no UI)`)
  }).catch((err) => {
    console.error('[Headless] Failed to load router:', err)
    process.exit(1)
  })
} else {
  // Full mode: Next.js handles all requests (pages + API routes)
  const next = (await import('next')).default
  const app = next({ dev, hostname, port })
  const handle = app.getRequestHandler()

  await app.prepare()

  startServer(async (req, res, parsedUrl) => {
    await handle(req, res, parsedUrl)
  })
}
