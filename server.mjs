// NT-031: This file dynamically imports .ts files (e.g., lib/agent-runtime.ts,
// lib/agent.ts, lib/governance-request-registry.ts, services/headless-router.ts).
// These imports rely on tsx or Next.js runtime transpilation. Running this file
// with plain `node` (without tsx) will fail. In full mode Next.js provides the
// transpiler; in headless mode `tsx server.mjs` must be used.
import { createServer } from 'http'
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
  broadcastStatusUpdate,
  setOnStatusUpdateCallback
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
  const logsDir = path.join(process.cwd(), 'logs')
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true })
  const crashLogPath = path.join(logsDir, 'crash.log')
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
  // MF-015: Ensure logs directory exists before writing (same guard as uncaughtException)
  const logsDir = path.join(process.cwd(), 'logs')
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true })
  const crashLogPath = path.join(logsDir, 'crash.log')
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
const hostname = process.env.HOSTNAME || '127.0.0.1' // Primary bind address (localhost-only by default)
const port = parseInt(process.env.PORT || '23000', 10)

// Auto-detect Tailscale IP for VPN access (iPad, mobile, remote hosts)
let tailscaleIp = null
try {
  const { execSync: execSyncBind } = await import('child_process')
  tailscaleIp = execSyncBind('tailscale ip -4', { encoding: 'utf8', timeout: 3000 }).trim()
  if (!/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(tailscaleIp)) tailscaleIp = null // Only Tailscale CGNAT (100.64.0.0/10)
} catch { /* tailscale not installed or not running */ }

// IP filter: when bound to 0.0.0.0, only allow localhost + Tailscale IPs
// This prevents LAN exposure while allowing VPN access
function isAllowedSource(remoteAddress) {
  if (!remoteAddress) return false
  const ip = remoteAddress.replace(/^::ffff:/, '') // Strip IPv4-mapped IPv6 prefix
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true // Tailscale CGNAT (100.64.0.0/10)
  if (/^fd7a:115c:a1e0:/.test(ip)) return true // Tailscale IPv6 range
  return false
}

// Server mode: 'full' (default) = Next.js + UI, 'headless' = API-only (no Next.js)
const MAESTRO_MODE = process.env.MAESTRO_MODE || 'full'

// Global logging master switch - set ENABLE_LOGGING=true to enable all logging
const globalLoggingEnabled = process.env.ENABLE_LOGGING === 'true'

// Session state management
// sessionActivity, terminalSessions, statusSubscribers, companionClients, broadcastStatusUpdate
// are imported from shared-state-bridge.mjs (backed by globalThis._sharedState)
const idleTimers = new Map() // sessionName -> { timer, wasActive }

// Auto-continue timers: when an agent is waiting at prompt for too long, auto-send "continue"
const autoContinueTimers = new Map() // sessionName -> { timer, startedAt }
const AUTO_CONTINUE_DEFAULT_MS = 4 * 60 * 1000 // 4 minutes default

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

/**
 * Auto-continue: keeps Claude sessions alive by sending "continue" when idle.
 *
 * REQUIRES: Agent must have --dangerously-skip-permissions in programArgs.
 * This eliminates permission prompts entirely, so the only remaining
 * interruptions are choice menus — handled by sending Escape first.
 *
 * Sequence on idle timeout:
 *   1. Send Escape (dismiss any choice menu / question if present)
 *   2. Wait 500ms for prompt to stabilize
 *   3. Send "continue" + Enter
 *
 * This loop repeats indefinitely, keeping the context cache warm
 * and avoiding massive token reprocessing costs on resume.
 */
function startAutoContinueTimer(sessionName, delayMs) {
  // Cancel any existing timer for this session
  cancelAutoContinueTimer(sessionName)

  const timer = setTimeout(async () => {
    autoContinueTimers.delete(sessionName)
    try {
      // Defense-in-depth: re-validate sessionName before execSync (original validation was at WS connect time)
      if (!/^[a-zA-Z0-9_@.-]+$/.test(sessionName)) return
      const { getAgentBySession } = await import('./lib/agent-registry.ts')
      const agent = getAgentBySession(sessionName)
      if (!agent?.preferences?.autoContinue) return // preference was toggled off

      // SAFETY: require --dangerously-skip-permissions to avoid permission prompt interference
      const args = agent.programArgs || ''
      if (!args.includes('--dangerously-skip-permissions')) {
        console.log(`[AutoContinue] ${sessionName}: skipped — missing --dangerously-skip-permissions`)
        return
      }

      // Re-check the hook state before sending
      const stateDir = path.join(os.homedir(), '.aimaestro', 'chat-state')
      const crypto = await import('crypto')
      const cwdHash = crypto.createHash('md5').update(agent.workingDirectory || '').digest('hex').substring(0, 16)
      const stateFile = path.join(stateDir, `${cwdHash}.json`)

      if (fs.existsSync(stateFile)) {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
        // Only proceed if waiting_for_input (any notification type — Escape handles menus)
        if (state.status !== 'waiting_for_input') {
          console.log(`[AutoContinue] ${sessionName}: skipped — state=${state.status}`)
          return
        }
      } else {
        return // no state file means we can't confirm it's safe
      }

      // Step 1: Send Escape to dismiss any choice menu or question
      const { execSync } = await import('child_process')
      execSync(`tmux send-keys -t "${sessionName}" Escape`, { timeout: 5000 })

      // Step 2: Wait 500ms for prompt to stabilize after Escape
      await new Promise(resolve => setTimeout(resolve, 500))

      // Step 3: Send "continue" + Enter
      execSync(`tmux send-keys -t "${sessionName}" "continue" Enter`, { timeout: 5000 })
      console.log(`[AutoContinue] ${sessionName}: sent Escape + "continue" after ${delayMs / 1000}s idle`)
    } catch (err) {
      console.error(`[AutoContinue] ${sessionName}: failed —`, err.message)
    }
  }, delayMs)

  autoContinueTimers.set(sessionName, { timer, startedAt: Date.now() })
}

function cancelAutoContinueTimer(sessionName) {
  const existing = autoContinueTimers.get(sessionName)
  if (existing?.timer) {
    clearTimeout(existing.timer)
    autoContinueTimers.delete(sessionName)
  }
}

/**
 * Called when a session's activity status changes.
 * Manages auto-continue timers based on waiting/idle state.
 * Triggers on both idle_prompt and permission_prompt (Escape handles menus).
 */
async function checkAutoContinue(sessionName, status, hookStatus, notificationType) {
  // Start timer when waiting for input (any notification type)
  if (status === 'waiting') {
    try {
      const { getAgentBySession } = await import('./lib/agent-registry.ts')
      const agent = getAgentBySession(sessionName)
      if (agent?.preferences?.autoContinue) {
        const delay = agent.preferences.autoContinueDelayMs || AUTO_CONTINUE_DEFAULT_MS
        // Don't restart timer if one is already running for this session
        if (!autoContinueTimers.has(sessionName)) {
          startAutoContinueTimer(sessionName, delay)
          console.log(`[AutoContinue] ${sessionName}: timer started (${delay / 1000}s, notification=${notificationType})`)
        }
      }
    } catch {
      // Agent registry not available yet during startup
    }
  } else if (status === 'active') {
    // Agent became active — cancel timer (it's working again)
    if (autoContinueTimers.has(sessionName)) {
      cancelAutoContinueTimer(sessionName)
      console.log(`[AutoContinue] ${sessionName}: timer cancelled (active)`)
    }
  }
  // Note: 'idle' status does NOT cancel — agent may just be between output chunks
}

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// statusSubscribers, broadcastStatusUpdate imported from shared-state-bridge.mjs

// Register auto-continue callback to fire on every status broadcast
setOnStatusUpdateCallback((sessionName, status, hookStatus, notificationType) => {
  checkAutoContinue(sessionName, status, hookStatus, notificationType)
})

/**
 * Start the HTTP server with the given request handler.
 * All WebSocket servers, PTY handling, startup tasks, and graceful shutdown
 * are shared between full and headless modes.
 */
async function startServer(handleRequest) {
  const server = createServer(async (req, res) => {
    try {
      // Use the WHATWG URL API instead of the deprecated url.parse().
      // Construct a Next.js-compatible { pathname, query } object so that both
      // the internal endpoint check and app.getRequestHandler() work correctly.
      const _url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
      const parsedUrl = {
        pathname: _url.pathname,
        query: Object.fromEntries(_url.searchParams),
        search: _url.search,
        href: _url.href
      }

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

        // Remove stale listeners from previous retry attempts to avoid duplicates.
        // MF-016: Only remove client listeners added inside the 'open' handler (message
        // proxying and per-connection close/error). The early-close handler registered
        // outside attemptConnection() is re-established immediately after clearing to
        // prevent a gap where client disconnection would go unhandled.
        clientWs.removeAllListeners('message')
        clientWs.removeAllListeners('close')
        clientWs.removeAllListeners('error')

        // MF-016: Re-register client close and error handlers immediately after
        // clearing to prevent any gap where client disconnection goes unhandled.
        // These replace both the early-close handler (registered outside
        // attemptConnection) and the previous per-connection handlers.
        clientWs.on('close', () => {
          clientClosed = true
          console.log(`🌐 [REMOTE] Client disconnected from ${sessionName}`)
          if (workerWs && workerWs.readyState === WebSocket.OPEN) {
            workerWs.close()
          }
        })

        clientWs.on('error', (error) => {
          clientClosed = true
          console.error(`🌐 [REMOTE] Client error for ${sessionName}:`, error.message)
          if (workerWs && workerWs.readyState === WebSocket.OPEN) {
            workerWs.close()
          }
        })

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

        // Client close/error handlers are registered immediately after
        // removeAllListeners above (MF-016) -- no duplicate registration needed here.
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

    // Send current status to new subscriber (including hook states).
    // NT-034: This uses a loopback HTTP request to self. Ideally we would call
    // the handler function directly, but the session activity endpoint lives in
    // a Next.js API route that is only accessible via HTTP. The fallback below
    // handles the case where the loopback fetch fails (e.g., during startup).
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/sessions/activity`)
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

      // SF-040: Each client removes its own listener on close to prevent
      // event listener leaks when multiple companion clients connect.
      if (ws._companionCleanup?.listener) {
        import('./lib/agent.ts').then(({ agentRegistry }) => {
          const agent = agentRegistry.getExistingAgent(agentId)
          const cerebellum = agent?.getCerebellum()
          if (cerebellum) {
            cerebellum.off('voice:speak', ws._companionCleanup.listener)
          }
        }).catch(() => { /* ignore */ })
      }

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
    // Use WHATWG URL API instead of deprecated url.parse().
    // Convert searchParams to a plain object so downstream handlers can use query.name, query.host, etc.
    const _upgradeUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
    const pathname = _upgradeUrl.pathname
    const query = Object.fromEntries(_upgradeUrl.searchParams)

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

    // Validate session name to prevent command injection in tmux attach.
    // Only allow alphanumeric, underscore, hyphen, at-sign, and dot.
    if (!/^[a-zA-Z0-9_@.-]+$/.test(sessionName)) {
      ws.close(1008, 'Invalid session name')
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

      // SESSION STATE BRANCHING:
      //
      // At this point we have two possible paths:
      //
      // Path A (existing session): Another WebSocket client already created the
      //   session state (pty + log stream + client set) while we were retrying
      //   the PTY spawn. In this case, `sessionState` is truthy from the lookup
      //   above, so we skip creation and fall through to add this client to the
      //   existing session's client set.
      //
      // Path B (new session): No session state exists yet, so we create it here:
      //   allocate a new client set, wire up PTY data/exit handlers, start a log
      //   stream (if logging is enabled), and register everything in the
      //   terminalSessions map. Subsequent clients will take Path A.
      if (sessionState) {
        // Path A: fall through to add client to existing session
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

        // Resume PTY after all clients have received the data.
        // SF-041: Wrap resume() in try-catch because the PTY process may have
        // already exited during the backpressure cycle.
        Promise.all(writePromises).finally(() => {
          try {
            ptyProcess.resume()
          } catch {
            // PTY already exited -- nothing to resume
          }
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
            // Reset SGR attributes before sending plain-text history so stale
            // reverse-video / color state from the live PTY stream doesn't bleed
            // into the history rendering (history is captured without ANSI codes)
            const formattedHistory = '\x1b[0m' + historyContent.replace(/\n/g, '\r\n')
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
        // SF-005: Guard against accessing PTY after cleanup -- the PTY process
        // may have exited between when the message was queued and processed
        if (sessionState.cleanedUp || !sessionState.ptyProcess) {
          return
        }

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

  // Determine bind address: if Tailscale is available, bind to :: (dual-stack IPv4+IPv6)
  // so both Tailscale IPv4 (100.x) and IPv6 (fd7a:...) addresses work.
  // Non-allowed IPs are rejected at the TCP level by the connection filter.
  const isLocalOnly = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
  const bindAddress = (tailscaleIp && isLocalOnly) ? '::' : hostname
  const needsIpFilter = tailscaleIp && (bindAddress === '::' || bindAddress === '0.0.0.0')

  // IP filter: drop LAN/internet connections at the TCP level (before any HTTP processing)
  // Activates for ANY non-localhost bind when Tailscale is detected — prevents HOSTNAME env bypass
  if (needsIpFilter) {
    server.on('connection', (socket) => {
      if (!isAllowedSource(socket.remoteAddress)) {
        socket.destroy()
      }
    })
  }

  server.listen(port, bindAddress, async () => {
    console.log(`> Ready on http://${hostname}:${port}`)
    if (needsIpFilter && tailscaleIp) {
      console.log(`> Tailscale VPN access on http://${tailscaleIp}:${port}`)
      console.log(`> IP filter active: only localhost + Tailscale (100.64.0.0/10) allowed`)
    }

    // Sync agent databases on startup
    try {
      const { syncAgentDatabases } = await import('./lib/agent-db-sync.mjs')
      await syncAgentDatabases()
    } catch (error) {
      console.error('[DB-SYNC] Failed to sync agent databases on startup:', error)
    }

    // Kill any orphaned creation-helper sessions on startup.
    // These zombie sessions can consume tokens indefinitely if not cleaned up.
    try {
      const { execFile } = await import('child_process')
      const { promisify } = await import('util')
      const execFileAsync = promisify(execFile)
      await execFileAsync('tmux', ['kill-session', '-t', '_aim-creation-helper']).catch(() => {})
      console.log('[Startup] Cleaned up orphaned _aim-creation-helper session (if any)')
    } catch { /* ignore — session might not exist */ }

    // Normalize agent hostIds on startup (Phase 1: AMP Protocol Fix)
    // This ensures all agents have canonical hostIds for proper AMP addressing
    setTimeout(async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/agents/normalize-hosts`, {
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
        const response = await fetch(`http://127.0.0.1:${port}/api/agents/directory/sync`, {
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
        const hostsResponse = await fetch(`http://127.0.0.1:${port}/api/hosts`)
        const hostsData = await hostsResponse.json()
        // SF-055: Use isSelf() + enabled check instead of deprecated h.type === 'remote'
        const remoteHosts = (hostsData.hosts || []).filter(h => !isSelf(h.id) && h.enabled !== false)

        if (remoteHosts.length > 0) {
          console.log(`[Host Sync] Registering with ${remoteHosts.length} remote host(s) on startup...`)

          const selfResponse = await fetch(`http://127.0.0.1:${port}/api/hosts/identity`)
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

    // NOTE: tailscale serve is NOT used. The server binds directly to 0.0.0.0
    // with an IP filter that only allows localhost + Tailscale IPs (100.x.x.x).
    // This is simpler and avoids the static file serving bugs in tailscale serve's HTTP proxy.

    // Agent initialization on startup is DISABLED to avoid CPU spike
    // Agents will be initialized on-demand when accessed via API
    // The subconscious processes will start when an agent is first accessed
    // To manually trigger indexing, call /api/agents/{id}/index-delta
    console.log('[AgentStartup] Startup indexing disabled - agents will initialize on-demand')

    // Purge expired governance requests on startup, then every 24 hours
    try {
      const { purgeOldRequests } = await import('./lib/governance-request-registry.ts')
      const result = await purgeOldRequests()
      if (result.purged > 0 || result.expired > 0) {
        console.log(`[Governance] Startup purge: ${result.purged} removed, ${result.expired} expired`)
      }
      setInterval(async () => {
        try {
          const result = await purgeOldRequests()
          if (result.purged > 0 || result.expired > 0) {
            console.log(`[Governance] Periodic purge: ${result.purged} removed, ${result.expired} expired`)
          }
        } catch (err) {
          console.error('[Governance] Periodic purge failed:', err.message)
        }
      }, 24 * 60 * 60 * 1000) // 24 hours
    } catch (error) {
      console.error('[Governance] Failed to initialize request purge:', error.message)
    }

    // Start periodic orphaned PTY cleanup to prevent leaks
    startOrphanedPtyCleanup()
  })

  // Graceful shutdown - kill PTYs FIRST before closing server
  const gracefulShutdown = (signal) => {
    console.log(`[Server] Received ${signal}, shutting down gracefully...`)

    // Cancel all auto-continue timers to prevent commands firing during teardown
    if (autoContinueTimers.size > 0) {
      console.log(`[Server] Cancelling ${autoContinueTimers.size} auto-continue timers...`)
      autoContinueTimers.forEach(({ timer }) => clearTimeout(timer))
      autoContinueTimers.clear()
    }

    // Close config-transaction SQLite DB (WAL journal flush)
    try {
      // Dynamic import because server.mjs can't statically import TypeScript
      import('./lib/config-transaction.ts').then(m => m.closeDb()).catch(() => {})
    } catch { /* best-effort */ }

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
