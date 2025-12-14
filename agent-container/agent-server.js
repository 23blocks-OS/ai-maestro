#!/usr/bin/env node
/**
 * Agent WebSocket Server
 *
 * This runs INSIDE each agent container and provides:
 * 1. WebSocket server for browser connections
 * 2. node-pty bridge to tmux session
 * 3. Health check endpoint
 *
 * The container exposes port 23000, and browsers connect to:
 * - Local: ws://localhost:23000/term
 * - Cloud: wss://agent.aimaestro.com/term
 */

const http = require('http')
const { WebSocketServer } = require('ws')
const pty = require('node-pty')
const { spawn } = require('child_process')
const { promisify } = require('util')
const exec = promisify(require('child_process').exec)

// Configuration from environment variables
const PORT = process.env.AGENT_PORT || 23000
const AGENT_ID = process.env.AGENT_ID || 'agent-' + Math.random().toString(36).substring(7)
const SESSION_NAME = process.env.TMUX_SESSION_NAME || 'agent-session'
const WORKSPACE = process.env.WORKSPACE || '/workspace'
// AI tool to start in the session (e.g., 'claude', 'aider', 'cursor', or empty for shell only)
const AI_TOOL = process.env.AI_TOOL || ''

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                   AI Maestro Agent Container                  ║
╚═══════════════════════════════════════════════════════════════╝

Agent ID:       ${AGENT_ID}
Session Name:   ${SESSION_NAME}
Workspace:      ${WORKSPACE}
WebSocket Port: ${PORT}

Starting WebSocket server...
`)

// HTTP server for health checks
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'healthy',
      agentId: AGENT_ID,
      sessionName: SESSION_NAME,
      workspace: WORKSPACE,
      timestamp: new Date().toISOString()
    }))
  } else if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(`AI Maestro Agent: ${AGENT_ID}\nWebSocket: ws://host:${PORT}/term\n`)
  } else {
    res.writeHead(404)
    res.end('Not Found')
  }
})

// WebSocket server
const wss = new WebSocketServer({
  server: httpServer,
  path: '/term'
})

// Active PTY sessions (shared across multiple WebSocket clients)
const sessions = new Map()

// Configure git with credentials
async function configureGit() {
  try {
    const gitUserName = process.env.GIT_USER_NAME || 'AI Maestro Agent'
    const gitUserEmail = process.env.GIT_USER_EMAIL || 'agent@23blocks.com'
    const githubToken = process.env.GITHUB_TOKEN

    console.log(`\n[Git Configuration]`)

    // Set git user name and email
    await exec(`git config --global user.name "${gitUserName}"`)
    await exec(`git config --global user.email "${gitUserEmail}"`)
    console.log(`✓ Configured git user: ${gitUserName} <${gitUserEmail}>`)

    // Configure git credential helper to use token
    if (githubToken) {
      // Store credentials in memory (not on disk for security)
      await exec(`git config --global credential.helper 'cache --timeout=86400'`)

      // Configure git to use HTTPS with token
      await exec(`git config --global url."https://${githubToken}@github.com/".insteadOf "https://github.com/"`)
      console.log(`✓ Configured GitHub authentication with token`)
    } else {
      console.log(`⚠ No GITHUB_TOKEN provided - git push will not work`)
      console.log(`  Set GITHUB_TOKEN environment variable to enable git push`)
    }
  } catch (err) {
    console.error(`✗ Failed to configure git:`, err.message)
  }
}

// Initialize tmux session on startup
async function initializeTmuxSession() {
  try {
    // Check if session already exists
    const { stdout } = await exec(`tmux has-session -t ${SESSION_NAME} 2>&1`)
    console.log(`✓ tmux session "${SESSION_NAME}" already exists`)
  } catch (error) {
    // Session doesn't exist, create it
    console.log(`Creating new tmux session: ${SESSION_NAME}`)

    try {
      await exec(`tmux new-session -d -s ${SESSION_NAME} -c ${WORKSPACE}`)
      console.log(`✓ Created tmux session: ${SESSION_NAME}`)

      // Optionally start an AI tool in the session (e.g., 'claude', 'aider', 'cursor')
      if (AI_TOOL) {
        await exec(`tmux send-keys -t ${SESSION_NAME} "${AI_TOOL}" C-m`)
        console.log(`✓ Started ${AI_TOOL} in session`)
      } else {
        console.log(`ℹ No AI_TOOL specified - session starts with shell only`)
      }
    } catch (err) {
      console.error(`✗ Failed to create tmux session:`, err.message)
    }
  }
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress
  console.log(`\n[${new Date().toISOString()}] New WebSocket connection from ${clientIp}`)

  let ptyProcess = null
  const sessionKey = SESSION_NAME

  // Get or create PTY process for this tmux session
  if (sessions.has(sessionKey)) {
    console.log(`  → Reusing existing PTY for session: ${sessionKey}`)
    const sessionData = sessions.get(sessionKey)
    ptyProcess = sessionData.pty
    sessionData.clients.add(ws)
    console.log(`  → Total clients connected: ${sessionData.clients.size}`)

    // Send current screen content to new client
    exec(`tmux capture-pane -t ${sessionKey} -p -e -S -50000 2>/dev/null || tmux capture-pane -t ${sessionKey} -p 2>/dev/null || echo ""`)
      .then(({ stdout }) => {
        if (stdout && ws.readyState === 1) {
          // Send captured content
          ws.send(stdout)
          console.log(`  ✓ Sent ${stdout.length} bytes of history to new client`)
        }
      })
      .catch((err) => {
        console.error(`  ✗ Failed to capture pane:`, err.message)
      })
  } else {
    console.log(`  → Creating new PTY for session: ${sessionKey}`)

    // Spawn PTY that attaches to tmux session
    ptyProcess = pty.spawn('tmux', ['attach-session', '-t', sessionKey], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: WORKSPACE,
      env: process.env
    })

    sessions.set(sessionKey, {
      pty: ptyProcess,
      clients: new Set([ws])
    })

    // Capture and send initial screen content to first client
    setTimeout(() => {
      exec(`tmux capture-pane -t ${sessionKey} -p -e -S -50000 2>/dev/null || tmux capture-pane -t ${sessionKey} -p 2>/dev/null || echo ""`)
        .then(({ stdout }) => {
          if (stdout && ws.readyState === 1) {
            ws.send(stdout)
            console.log(`  ✓ Sent ${stdout.length} bytes of initial content to first client`)
          }
        })
        .catch((err) => {
          console.error(`  ✗ Failed to capture initial pane:`, err.message)
        })
    }, 150) // Wait for tmux attach to complete

    // Broadcast PTY output to all connected clients
    ptyProcess.onData((data) => {
      const sessionData = sessions.get(sessionKey)
      if (sessionData) {
        // Send to all connected clients
        sessionData.clients.forEach((client) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            try {
              client.send(data)
            } catch (err) {
              console.error(`  ✗ Error sending to client:`, err.message)
            }
          }
        })
      }
    })

    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`\n[${new Date().toISOString()}] PTY exited for session: ${sessionKey}`)
      console.log(`  Exit code: ${exitCode}, Signal: ${signal}`)

      // Clean up session
      const sessionData = sessions.get(sessionKey)
      if (sessionData) {
        sessionData.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.close(1000, 'PTY exited')
          }
        })
      }
      sessions.delete(sessionKey)
    })

    console.log(`  ✓ PTY created and attached to tmux session`)
  }

  // Handle messages from client (terminal input)
  ws.on('message', (message) => {
    try {
      // Try to parse as JSON (for control messages)
      const data = JSON.parse(message.toString())

      if (data.type === 'input') {
        // Terminal input
        console.log(`  → Input (JSON): "${data.data.substring(0, 50)}"`)
        ptyProcess.write(data.data)
      } else if (data.type === 'resize') {
        // Terminal resize
        console.log(`  → Resize: ${data.cols}x${data.rows}`)
        ptyProcess.resize(data.cols, data.rows)
      } else if (data.type === 'ping') {
        // Heartbeat
        ws.send(JSON.stringify({ type: 'pong' }))
      } else if (data.type === 'set-logging') {
        // Logging control - ignore for now (container doesn't support logging yet)
        console.log(`  → Logging ${data.enabled ? 'enabled' : 'disabled'}`)
      } else {
        console.log(`  → Unknown message type: ${data.type}`)
      }
    } catch (e) {
      // Not JSON, treat as raw terminal input
      const msgStr = message.toString()
      console.log(`  → Input (raw): "${msgStr.substring(0, 50).replace(/[^\x20-\x7E]/g, '?')}"`)
      ptyProcess.write(msgStr)
    }
  })

  // Handle client disconnect
  ws.on('close', (code, reason) => {
    console.log(`\n[${new Date().toISOString()}] WebSocket disconnected`)
    console.log(`  Code: ${code}, Reason: ${reason || 'none'}`)

    const sessionData = sessions.get(sessionKey)
    if (sessionData) {
      sessionData.clients.delete(ws)
      console.log(`  → Remaining clients: ${sessionData.clients.size}`)

      // If no more clients, clean up after grace period
      if (sessionData.clients.size === 0) {
        console.log(`  → No clients remaining, starting 30s grace period...`)
        setTimeout(() => {
          const currentSessionData = sessions.get(sessionKey)
          if (currentSessionData && currentSessionData.clients.size === 0) {
            console.log(`  → Grace period expired, cleaning up PTY`)
            currentSessionData.pty.kill()
            sessions.delete(sessionKey)
          }
        }, 30000) // 30 second grace period
      }
    }
  })

  ws.on('error', (error) => {
    console.error(`\n[${new Date().toISOString()}] WebSocket error:`, error.message)
  })

  // Send initial connection success message
  ws.send(JSON.stringify({
    type: 'connected',
    agentId: AGENT_ID,
    sessionName: SESSION_NAME
  }))
})

// Start server
httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`
✓ Agent server started successfully!

Health Check:  http://0.0.0.0:${PORT}/health
WebSocket:     ws://0.0.0.0:${PORT}/term

Waiting for browser connections...
`)

  // Configure git with credentials
  await configureGit()

  // Initialize tmux session
  await initializeTmuxSession()
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...')

  // Close all WebSocket connections
  sessions.forEach((sessionData, sessionKey) => {
    console.log(`  Closing session: ${sessionKey}`)
    sessionData.clients.forEach((client) => {
      client.close(1000, 'Server shutting down')
    })
    sessionData.pty.kill()
  })

  httpServer.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down...')
  process.exit(0)
})
