import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import WebSocket from 'ws'
import pty from 'node-pty'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { getHostById } from './lib/hosts-config-server.mjs'
import { hostHints } from './lib/host-hints-server.mjs'

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || '0.0.0.0' // 0.0.0.0 allows network access
const port = parseInt(process.env.PORT || '23000', 10)

// Global logging master switch - set ENABLE_LOGGING=true to enable all logging
const globalLoggingEnabled = process.env.ENABLE_LOGGING === 'true'

// Initialize Next.js
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

// Session state management
const sessions = new Map() // sessionName -> { clients: Set, ptyProcess, logStream, lastActivity: timestamp }
const sessionActivity = new Map() // sessionName -> lastActivityTimestamp
const idleTimers = new Map() // sessionName -> { timer, wasActive }

// Idle threshold in milliseconds (30 seconds)
const IDLE_THRESHOLD_MS = 30 * 1000

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

// Status WebSocket subscribers (for real-time status updates)
const statusSubscribers = new Set()

// Broadcast status update to all subscribers
function broadcastStatusUpdate(sessionName, status, hookStatus, notificationType) {
  const message = JSON.stringify({
    type: 'status_update',
    sessionName,
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

// Expose session state globally for API routes
global.sessionActivity = sessionActivity
global.terminalSessions = sessions  // PTY processes per session
global.statusSubscribers = statusSubscribers
global.broadcastStatusUpdate = broadcastStatusUpdate

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      await handle(req, res, parsedUrl)
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

        if (host && host.type !== 'local') {
          console.log(`🌐 [REMOTE] Routing ${sessionName} to host ${host.id} (${host.url})`)
          handleRemoteWorker(ws, sessionName, host.url)
          return
        } else if (!host) {
          console.error(`🌐 [REMOTE] Host not found: ${query.host}`)
          ws.close(1008, `Host not found: ${query.host}`)
          return
        }
        // If host.type === 'local', fall through to local tmux handling
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
    let sessionState = sessions.get(sessionName)

    if (!sessionState) {

      // Spawn PTY with tmux attach (removed -r flag as it was causing exits)
      const ptyProcess = pty.spawn('tmux', ['attach-session', '-t', sessionName], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME || process.cwd(),
        env: process.env
      })

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
        cleanupTimer: null // Timer for cleaning up PTY when no clients connected
      }
      sessions.set(sessionName, sessionState)

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
        // Close the log stream
        if (sessionState.logStream) {
          sessionState.logStream.end()
          console.log(`Log file closed for session: ${sessionName}`)
        }

        // Clean up session
        sessions.delete(sessionName)

        // Close all clients
        sessionState.clients.forEach((client) => {
          client.close()
        })
      })
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

    // Send scrollback history to new clients
    setTimeout(async () => {
      try {
        const { execSync } = await import('child_process')

        let historyContent = ''
        try {
          // Capture scrollback history (up to 5000 lines) WITHOUT escape sequences
          // The -e flag was causing terminal query responses like ">0;276;0c" to appear
          // The -S -5000 flag captures scrollback history, not just visible pane
          historyContent = execSync(
            `tmux capture-pane -t ${sessionName} -p -S -5000 2>/dev/null || tmux capture-pane -t ${sessionName} -p`,
            { encoding: 'utf8', timeout: 5000, shell: '/bin/bash' }
          ).toString()
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
    }, 150)

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
      sessionState.clients.delete(ws)

      // If this was the last client, schedule cleanup after grace period
      if (sessionState.clients.size === 0) {
        console.log(`Last client disconnected from ${sessionName}, scheduling cleanup in 30s`)

        // Clear any existing cleanup timer
        if (sessionState.cleanupTimer) {
          clearTimeout(sessionState.cleanupTimer)
        }

        // Schedule cleanup after 30 second grace period
        sessionState.cleanupTimer = setTimeout(() => {
          // Check if still no clients (they might have reconnected)
          if (sessionState.clients.size === 0) {
            console.log(`No clients reconnected to ${sessionName}, cleaning up PTY`)

            // Close log stream
            if (sessionState.logStream) {
              sessionState.logStream.end()
            }

            // Kill PTY process and its entire process group
            try {
              // Kill the entire process group (negative PID) to prevent orphaned shells
              process.kill(-sessionState.ptyProcess.pid, 'SIGTERM')
            } catch (error) {
              // Fallback to direct kill if process group kill fails
              try {
                sessionState.ptyProcess.kill()
              } catch (e) {
                console.error(`Error killing PTY for ${sessionName}:`, e)
              }
            }

            // Remove from sessions map
            sessions.delete(sessionName)
          }
        }, 30000) // 30 second grace period
      }
    })

    ws.on('error', (error) => {
      console.error('WebSocket error:', error)
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
  })

  // Graceful shutdown - kill PTYs FIRST before closing server
  const gracefulShutdown = (signal) => {
    console.log(`[Server] Received ${signal}, shutting down gracefully...`)

    // Kill all PTY processes FIRST and synchronously
    const sessionCount = sessions.size
    console.log(`[Server] Cleaning up ${sessionCount} PTY sessions...`)

    sessions.forEach((state, sessionName) => {
      // Close log stream
      if (state.logStream) {
        try {
          state.logStream.end()
        } catch (e) {
          // Ignore
        }
      }
      // Kill PTY process and its entire process group
      if (state.ptyProcess && state.ptyProcess.pid) {
        const pid = state.ptyProcess.pid
        console.log(`[Server] Killing PTY for ${sessionName} (pid: ${pid})`)
        try {
          // Kill the entire process group (negative PID)
          process.kill(-pid, 'SIGKILL')
        } catch (e) {
          try {
            // Fallback to SIGTERM on direct process
            process.kill(pid, 'SIGKILL')
          } catch (e2) {
            try {
              // Last resort: use node-pty's kill
              state.ptyProcess.kill()
            } catch (e3) {
              console.error(`[Server] Failed to kill PTY ${sessionName}:`, e3.message)
            }
          }
        }
      }
    })

    // Clear the sessions map
    sessions.clear()
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
})
