#!/usr/bin/env node
/**
 * amp-channel-server — a Claude Code "channel" (MCP server) that pushes AMP
 * inbox events straight into a running Claude Code session, injecting a real
 * turn WITHOUT any tmux send-keys. This is the reliable last-mile that replaces
 * the fragile keystroke wake for idle agents.
 *
 * Contract (code.claude.com/docs/en/channels-reference):
 *   - declare capabilities.experimental['claude/channel'] = {}
 *   - connect over stdio (Claude Code spawns this as a subprocess)
 *   - push via mcp.notification({ method: 'notifications/claude/channel', params })
 *
 * Self-registration: on startup it binds a free localhost port and writes
 *   ~/.aimaestro/channels/<agentId>.json = { port, pid, startedAt }
 * so AI Maestro's deliver() (lib/channel-bridge.mjs) can find the port and POST
 * a message in. Removed on exit. AIMAESTRO_AGENT_ID is set by the agent launch.
 *
 * IMPORTANT: stdout is the MCP stdio transport — never log there. Use stderr.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const AGENT_ID = process.env.AIMAESTRO_AGENT_ID || process.env.AIM_AGENT_ID || ''
const CHANNELS_DIR = path.join(os.homedir(), '.aimaestro', 'channels')
const REG_FILE = AGENT_ID ? path.join(CHANNELS_DIR, `${AGENT_ID}.json`) : null

const mcp = new Server(
  { name: 'amp', version: '0.1.0' },
  {
    capabilities: { experimental: { 'claude/channel': {} } },
    instructions:
      'Events from the "amp" channel arrive as <channel source="amp" ...>. ' +
      'They mean new AMP messages landed in your inbox while you were idle. ' +
      'Read and address them using the agent-messaging skill (amp-inbox.sh, ' +
      'amp-read.sh <id>, amp-reply.sh <id> "..."), then continue. ' +
      'One-way channel: no reply is expected back through it.',
  },
)

await mcp.connect(new StdioServerTransport())

function cleanup() {
  try { if (REG_FILE && fs.existsSync(REG_FILE)) fs.unlinkSync(REG_FILE) } catch { /* ignore */ }
}
process.on('exit', cleanup)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { cleanup(); process.exit(0) })
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(405); res.end('POST only'); return }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', async () => {
    try {
      await mcp.notification({
        method: 'notifications/claude/channel',
        params: {
          content: body || 'You have new AMP messages. Check your inbox.',
          meta: { source: 'amp' },
        },
      })
      res.writeHead(200); res.end('ok')
    } catch (e) {
      process.stderr.write(`[amp-channel] push failed: ${e}\n`)
      res.writeHead(500); res.end(String(e))
    }
  })
})

// Bind a free localhost port, then self-register so deliver() can find us.
server.listen(0, '127.0.0.1', () => {
  const { port } = server.address()
  if (REG_FILE) {
    try {
      fs.mkdirSync(CHANNELS_DIR, { recursive: true })
      fs.writeFileSync(
        REG_FILE,
        JSON.stringify({ agentId: AGENT_ID, port, pid: process.pid, startedAt: new Date().toISOString() })
      )
    } catch (e) {
      process.stderr.write(`[amp-channel] registry write failed: ${e}\n`)
    }
  }
  process.stderr.write(`[amp-channel] agent=${AGENT_ID || '(unset)'} listening 127.0.0.1:${port}\n`)
})
