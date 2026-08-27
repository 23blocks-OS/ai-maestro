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
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
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
    capabilities: {
      experimental: { 'claude/channel': {} },
      tools: {}, // enables discovery of amp_channel_ack (the delivery handshake)
    },
    instructions:
      'Events from the "amp" channel arrive as <channel source="amp" ...>. ' +
      'They mean new AMP messages landed in your inbox. ' +
      'The event body already contains the message, so act on it directly; use ' +
      'the agent-messaging skill (amp-inbox.sh, amp-read.sh <id>, ' +
      'amp-reply.sh <id> "...") to read the full copy or reply, then continue. ' +
      'The FIRST time you see an <channel source="amp"> event in this session, ' +
      'also call the amp_channel_ack tool once. That confirms this session can ' +
      'actually receive channel events; until it is confirmed AI Maestro must ' +
      'keep sending a duplicate tmux notification as a safety net. ' +
      'One acknowledgement per session is enough — do not call it again.',
  },
)

// --- Delivery handshake -----------------------------------------------------
// Claude Code does NOT acknowledge channel notifications: mcp.notification()
// resolves when the event is written to the transport, not when the model has
// seen it. If the session never registered us as a channel (org policy off,
// plugin not on the allowlist, --channels not passed), events are dropped
// SILENTLY. So a successful push proves nothing on its own, and deliver() must
// not suppress the tmux fallback on that basis alone.
//
// The failure is static per session — a channel that is registered stays
// registered — so one confirmation is enough for the session's lifetime. The
// model calls amp_channel_ack once; we persist verified:true into the registry
// file, and deliver() reads it to decide whether it may skip the fallback.
// If the model never calls it, we simply never suppress the fallback: the
// degraded state is exactly today's behaviour, not a dropped message.
let verified = false

function markVerified() {
  if (verified || !REG_FILE) return
  verified = true
  try {
    const info = JSON.parse(fs.readFileSync(REG_FILE, 'utf8'))
    info.verified = true
    info.verifiedAt = new Date().toISOString()
    fs.writeFileSync(REG_FILE, JSON.stringify(info))
    process.stderr.write(`[amp-channel] verified — session receives channel events\n`)
  } catch (e) {
    process.stderr.write(`[amp-channel] verify write failed: ${e}\n`)
  }
}

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'amp_channel_ack',
      description:
        'Confirm once per session that you received an <channel source="amp"> ' +
        'event. Call this the first time you see one and never again. It lets ' +
        'AI Maestro stop sending duplicate tmux notifications to this session.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== 'amp_channel_ack') {
    return { isError: true, content: [{ type: 'text', text: `unknown tool: ${req.params.name}` }] }
  }
  markVerified()
  return { content: [{ type: 'text', text: 'Channel delivery confirmed. Do not call this again.' }] }
})

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
