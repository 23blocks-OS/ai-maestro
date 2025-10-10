import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import pty from 'node-pty'
import os from 'os'

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || '0.0.0.0' // 0.0.0.0 allows network access
const port = parseInt(process.env.PORT || '23000', 10)

// Initialize Next.js
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

// Session state management
const sessions = new Map() // sessionName -> { clients: Set, ptyProcess }

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

      sessionState = {
        clients: new Set(),
        ptyProcess
      }
      sessions.set(sessionName, sessionState)

      // Stream PTY output to all clients
      ptyProcess.onData((data) => {
        sessionState.clients.forEach((client) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            try {
              client.send(data)
            } catch (error) {
              console.error('Error sending data to client:', error)
            }
          }
        })
      })

      ptyProcess.onExit(({ exitCode, signal }) => {
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

    // Send tmux scrollback history to the new client
    // This captures the tmux pane's scrollback and sends it to xterm.js
    setTimeout(async () => {
      try {
        const { execSync } = await import('child_process')

        // Capture both normal and alternate screen buffer content
        // -p: print to stdout, -S: start line (negative = lines from history), -e: end line
        // First, try to capture the entire scrollback history
        try {
          const history = execSync(
            `tmux capture-pane -t ${sessionName} -p -S -50000 -e -1 2>/dev/null || tmux capture-pane -t ${sessionName} -p -S - -e -`,
            {
              encoding: 'utf8',
              maxBuffer: 100 * 1024 * 1024, // 100MB buffer for large histories
              timeout: 5000, // 5 second timeout
            }
          ).toString()

          // Send the history to the client if we got content
          if (ws.readyState === 1 && history && history.trim().length > 0) {
            ws.send(history)
          }
        } catch (captureError) {
          console.warn('Could not capture full history, trying visible pane only:', captureError.message)

          // Fallback: capture just the visible pane content
          try {
            const visibleContent = execSync(
              `tmux capture-pane -t ${sessionName} -p`,
              {
                encoding: 'utf8',
                timeout: 2000,
              }
            ).toString()

            if (ws.readyState === 1 && visibleContent) {
              ws.send(visibleContent)
            }
          } catch (fallbackError) {
            console.error('Could not capture visible content either:', fallbackError.message)
          }
        }
      } catch (error) {
        console.error('Error in history capture process:', error)
        // Don't send Ctrl-L as it might interfere with running applications
        // Just let the session load naturally
      }
    }, 150) // Slightly longer delay to let tmux settle

    // Handle client input
    ws.on('message', (data) => {
      try {
        const message = data.toString()

        // Check if it's a JSON message (for resize events, etc.)
        try {
          const parsed = JSON.parse(message)

          if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
            sessionState.ptyProcess.resize(parsed.cols, parsed.rows)
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

      // DON'T kill the PTY - keep it alive for when they return
      // This preserves the terminal buffer and session state
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
      if (state.ptyProcess) {
        state.ptyProcess.kill()
      }
    })
    server.close(() => {
      process.exit(0)
    })
  })
})
