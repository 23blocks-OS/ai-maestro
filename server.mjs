import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import pty from 'node-pty'
import os from 'os'
import fs from 'fs'
import path from 'path'

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

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// Expose sessionActivity globally for API routes
global.sessionActivity = sessionActivity

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

  server.on('upgrade', (request, socket, head) => {
    const { pathname, query } = parse(request.url, true)

    if (pathname === '/term') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, query)
      })
    } else {
      socket.destroy()
    }
  })

  wss.on('connection', (ws, request, query) => {
    const sessionName = query.name

    if (!sessionName || typeof sessionName !== 'string') {
      ws.close(1008, 'Session name required')
      return
    }

    // Get or create session state
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
        cleanupTimer: null // Timer for cleaning up when no clients connected
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
          sessionActivity.set(sessionName, Date.now())
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

    // If there was a cleanup timer scheduled, cancel it (client reconnected)
    if (sessionState.cleanupTimer) {
      console.log(`Client reconnected to ${sessionName}, canceling cleanup`)
      clearTimeout(sessionState.cleanupTimer)
      sessionState.cleanupTimer = null
    }

    // Send full scrollback history to new clients
    // Critical: We need to capture the full history so scrollback works on reconnect
    setTimeout(async () => {
      try {
        const { execSync } = await import('child_process')

        // Try to capture scrollback history (last 1000 lines for reasonable performance)
        let historyContent = ''
        try {
          // CRITICAL: Capture WITHOUT escape sequences to avoid cursor positioning
          // -S -1000: Start from 1000 lines back (enough for context, not overwhelming)
          // -p: Print to stdout
          // -J: Join wrapped lines (removes artificial wrapping from tmux's internal width)
          // NO -e flag: Without escape sequences, tmux sends plain text with newlines
          // This allows xterm.js to add lines to scrollback instead of repositioning cursor
          historyContent = execSync(
            `tmux capture-pane -t ${sessionName} -p -S -1000 -J`,
            { encoding: 'utf8', timeout: 3000 }
          ).toString()
        } catch (historyError) {
          // Fallback: if full history fails, at least get visible content
          try {
            historyContent = execSync(
              `tmux capture-pane -t ${sessionName} -p -J`,
              { encoding: 'utf8', timeout: 2000 }
            ).toString()
          } catch (fallbackError) {
            // Last resort: no -J flag
            historyContent = execSync(
              `tmux capture-pane -t ${sessionName} -p`,
              { encoding: 'utf8', timeout: 2000 }
            ).toString()
          }
        }

        if (ws.readyState === 1 && historyContent) {
          // CRITICAL: Convert plain text to terminal-friendly format
          // Each line must end with \r\n for xterm.js to add it to scrollback
          // Plain newlines (\n) would just move cursor down without creating history
          const lines = historyContent.split('\n')
          const formattedHistory = lines.map(line => line + '\r\n').join('')

          console.log(`📜 [HISTORY-SEND] Sending ${lines.length} lines of history for session ${sessionName}`)

          // Send history content as formatted data
          ws.send(formattedHistory)

          // Send a special message to signal that initial history load is complete
          // This allows the client to trigger scrollToBottom() and fit()
          ws.send(JSON.stringify({ type: 'history-complete' }))
        }
      } catch (error) {
        console.error('Error capturing terminal history:', error)
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

            // Kill PTY process
            try {
              sessionState.ptyProcess.kill()
            } catch (error) {
              console.error(`Error killing PTY for ${sessionName}:`, error)
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

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
  })

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sessions.forEach((state) => {
      // Close log stream
      if (state.logStream) {
        state.logStream.end()
      }
      // Kill PTY process
      if (state.ptyProcess) {
        state.ptyProcess.kill()
      }
    })
    server.close(() => {
      process.exit(0)
    })
  })
})
