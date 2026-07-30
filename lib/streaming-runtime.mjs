/**
 * Streaming Runtime — per-agent Claude Agent SDK sessions (stream-json mode).
 *
 * One persistent SDK-driven `claude` session per agent, kept alive across
 * client (re)connects. Drives the Agent SDK's streaming-input `query()` so we
 * get, on the user's subscription:
 *   - persistent context across turns (one long-lived session)
 *   - `--resume` of the agent's latest conversation (continuity with terminal mode)
 *   - `canUseTool` permission callbacks (rendered as cards in the browser)
 *
 * The WebSocket layer (server.mjs /stream-chat) attaches clients to a session,
 * pushes user turns, relays permission decisions, and receives the buffered +
 * live event stream. This module owns the SDK lifecycle; server.mjs owns transport.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { query } from '@anthropic-ai/claude-agent-sdk'

const IDLE_MS = 15 * 60 * 1000   // kill a session 15 min after the last client leaves
const BUFFER_MAX = 5000          // cap buffered events (older drop)
const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000  // auto-deny a permission after 5 min unanswered

// agentKey -> Session
// Backed by globalThis so the raw-ESM copy imported by server.mjs and the
// Next-bundled copy imported by the delivery/service layer share ONE map
// (same pattern as shared-state-bridge.mjs). Without this, an AMP message
// routed through a Next API route could never find the live SDK session that
// server.mjs created. See lib/streaming-bridge.mjs for the reader side.
const sessions = globalThis._streamSessions || (globalThis._streamSessions = new Map())

/** Build a clean env for the SDK subprocess: subscription token, never an API
 *  key. Reads the headless token (macOS daemons can't reach the Keychain). */
function buildEnv(agentId, agentName) {
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  if (!env.CLAUDE_CODE_OAUTH_TOKEN) {
    try {
      const f = path.join(os.homedir(), '.aimaestro', 'claude-oauth-token')
      if (fs.existsSync(f)) {
        const t = fs.readFileSync(f, 'utf-8').trim()
        if (t) env.CLAUDE_CODE_OAUTH_TOKEN = t
      }
    } catch { /* ignore */ }
  }
  if (agentId) env.AIMAESTRO_AGENT_ID = agentId
  if (agentName) env.AIMAESTRO_AGENT_NAME = agentName
  return env
}

class Session {
  constructor(agentKey, opts) {
    this.agentKey = agentKey
    this.cwd = opts.cwd
    this.agentId = opts.agentId || null
    this.agentName = opts.agentName || null
    this.hasToken = false
    this.clients = new Set()
    this.events = []          // buffered envelope strings for replay
    this.pending = new Map()  // requestId -> { resolve, timer } for permissions
    this.idleTimer = null
    this.closed = false
    this.exited = false

    // streaming-input queue + waker (push user turns into the live session)
    this._queue = []
    this._waker = null

    const env = buildEnv(this.agentId, this.agentName)
    this.hasToken = !!env.CLAUDE_CODE_OAUTH_TOKEN

    const options = {
      cwd: this.cwd,
      env,
      includePartialMessages: true,     // token-by-token deltas
      settingSources: ['project', 'user', 'local'],  // load CLAUDE.md, skills, allow-rules
      permissionMode: 'default',        // safe tools auto-approve; risky ones → canUseTool
      canUseTool: (toolName, input, ctx) => this._onCanUseTool(toolName, input, ctx),
    }
    if (opts.resumeSessionId) options.resume = opts.resumeSessionId

    this._query = query({ prompt: this._input(), options })
    this._consume()
  }

  async *_input() {
    while (!this.closed) {
      while (this._queue.length > 0) yield this._queue.shift()
      if (this.closed) return
      await new Promise((r) => { this._waker = r })
    }
  }

  /** Push a user turn into the live SDK session. */
  push(text) {
    if (this.closed) return
    this._queue.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, session_id: '' })
    this._waker?.()
    // mirror the user turn to clients + buffer (SDK stdout doesn't echo input)
    this._emit({ type: 'stream:user', text })
  }

  /** Permission callback — forward to clients, await the user's decision. */
  _onCanUseTool(toolName, input, ctx) {
    return new Promise((resolve) => {
      const requestId = `perm_${Date.now()}_${this.pending.size}_${Math.floor(performance.now())}`
      const timer = setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId)
          this._emit({ type: 'stream:permission-resolved', requestId, decision: 'timeout' })
          resolve({ behavior: 'deny', message: 'Permission request timed out with no response.' })
        }
      }, PERMISSION_TIMEOUT_MS)
      this.pending.set(requestId, { resolve, input, timer })
      // Surface the request as a card. Include the suggestion options the SDK
      // offers (ctx.suggestions) when present.
      this._emit({
        type: 'stream:permission',
        requestId,
        toolName,
        input,
        suggestions: (ctx && ctx.suggestions) || null,
      })
    })
  }

  /** Client answered a permission card. decision: 'allow' | 'allow-always' | 'deny'. */
  resolvePermission(requestId, decision, message) {
    const p = this.pending.get(requestId)
    if (!p) return
    clearTimeout(p.timer)
    this.pending.delete(requestId)
    this._emit({ type: 'stream:permission-resolved', requestId, decision })
    if (decision === 'allow' || decision === 'allow-always') {
      const result = { behavior: 'allow', updatedInput: p.input }
      // 'allow-always' could add a permission suggestion here later
      p.resolve(result)
    } else {
      p.resolve({ behavior: 'deny', message: message || 'Denied by the user.' })
    }
  }

  async _consume() {
    try {
      for await (const msg of this._query) {
        // Forward every SDK message to the client as a stream:event (the
        // renderer already understands system/stream_event/assistant/result).
        this._emit({ type: 'stream:event', event: msg })
      }
    } catch (err) {
      this._emit({ type: 'stream:error', error: String(err && err.message || err) })
    } finally {
      this.exited = true
      this._emit({ type: 'stream:exit' })
    }
  }

  /** Buffer + broadcast an envelope object to all attached clients. */
  _emit(obj) {
    const s = JSON.stringify(obj)
    this.events.push(s)
    if (this.events.length > BUFFER_MAX) this.events.shift()
    this.clients.forEach((ws) => { if (ws.readyState === 1) { try { ws.send(s) } catch { /* gone */ } } })
  }

  attach(ws) {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null }
    this.clients.add(ws)
    // ready + full replay so a returning client rebuilds the conversation
    if (ws.readyState === 1) {
      try {
        ws.send(JSON.stringify({ type: 'stream:ready', cwd: this.cwd, hasToken: this.hasToken, resumed: this.events.length > 0 }))
        for (const e of this.events) ws.send(e)
        ws.send(JSON.stringify({ type: 'stream:replay-done' }))
      } catch { /* gone */ }
    }
  }

  detach(ws) {
    this.clients.delete(ws)
    if (this.clients.size === 0 && !this.idleTimer && !this.exited) {
      this.idleTimer = setTimeout(() => destroy(this.agentKey), IDLE_MS)
    }
  }

  close() {
    this.closed = true
    this._waker?.()
    // deny any dangling permission requests
    for (const [, p] of this.pending) { clearTimeout(p.timer); try { p.resolve({ behavior: 'deny', message: 'Session closed.' }) } catch { /* ignore */ } }
    this.pending.clear()
    try { this._query.interrupt?.() } catch { /* ignore */ }
    try { this._query.return?.() } catch { /* ignore */ }
  }
}

/** Get or create the streaming session for an agent. */
export function getOrCreateStreamSession(agentKey, opts) {
  let s = sessions.get(agentKey)
  if (s && s.exited) { destroy(agentKey); s = null }
  if (!s) {
    s = new Session(agentKey, opts)
    sessions.set(agentKey, s)
    console.log(`[StreamRuntime] Started SDK session for ${agentKey} in ${opts.cwd} (resume: ${opts.resumeSessionId ? opts.resumeSessionId.slice(0, 8) : 'none'}, token: ${s.hasToken})`)
  }
  return s
}

export function getStreamSession(agentKey) {
  return sessions.get(agentKey) || null
}

/** Destroy a session (kill the SDK subprocess + drop from the map). */
export function destroy(agentKey) {
  const s = sessions.get(agentKey)
  if (!s) return
  console.log(`[StreamRuntime] Destroying SDK session for ${agentKey}`)
  s.close()
  sessions.delete(agentKey)
}

/** For shutdown: close everything. */
export function destroyAllStreamSessions() {
  for (const k of Array.from(sessions.keys())) destroy(k)
}
