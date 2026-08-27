/**
 * Tests for lib/channel-bridge.mjs + the amp-channel-server delivery handshake.
 *
 * The bug these guard: pushToChannel() returning true only means our own local
 * HTTP server accepted the POST and wrote an MCP notification to the stdio
 * transport. Claude Code never acknowledges channel notifications and drops
 * them silently when the session did not register the server as a channel. So
 * deliver() must NOT suppress the tmux fallback on a successful push — only on
 * isChannelVerified(), which flips to true after the model calls the server's
 * amp_channel_ack tool once.
 *
 * The registry file at ~/.aimaestro/channels/<agentId>.json is the IPC between
 * the channel server (inside the agent's CLI process) and AI Maestro's server,
 * so these tests drive that file directly.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getChannelInfo, hasChannel, isChannelVerified, pushToChannel } from '@/lib/channel-bridge.mjs'

const CHANNELS_DIR = path.join(os.homedir(), '.aimaestro', 'channels')
const AGENT_ID = 'test-channel-bridge-0000-1111-2222'
const REG_FILE = path.join(CHANNELS_DIR, `${AGENT_ID}.json`)

function writeReg(info: Record<string, unknown>) {
  fs.mkdirSync(CHANNELS_DIR, { recursive: true })
  fs.writeFileSync(REG_FILE, JSON.stringify({ agentId: AGENT_ID, ...info }))
}

function clearReg() {
  try { fs.unlinkSync(REG_FILE) } catch { /* not there */ }
}

describe('channel-bridge', () => {
  beforeEach(clearReg)
  afterAll(clearReg)

  it('reports no channel when the agent has no registry file', () => {
    expect(getChannelInfo(AGENT_ID)).toBeNull()
    expect(hasChannel(AGENT_ID)).toBe(false)
    expect(isChannelVerified(AGENT_ID)).toBe(false)
  })

  it('reports a channel once registered, but NOT verified', () => {
    writeReg({ port: 51234, pid: 1 })
    expect(hasChannel(AGENT_ID)).toBe(true)
    // The core guarantee: a registered channel is not a confirmed one.
    expect(isChannelVerified(AGENT_ID)).toBe(false)
  })

  it('reports verified only when the registry says verified:true', () => {
    writeReg({ port: 51234, pid: 1, verified: true, verifiedAt: '2026-08-26T00:00:00.000Z' })
    expect(isChannelVerified(AGENT_ID)).toBe(true)
  })

  it('does not treat a truthy non-true verified value as confirmation', () => {
    writeReg({ port: 51234, pid: 1, verified: 'yes' })
    expect(isChannelVerified(AGENT_ID)).toBe(false)
  })

  it('handles a corrupt registry file without throwing', () => {
    fs.mkdirSync(CHANNELS_DIR, { recursive: true })
    fs.writeFileSync(REG_FILE, 'not json{')
    expect(getChannelInfo(AGENT_ID)).toBeNull()
    expect(isChannelVerified(AGENT_ID)).toBe(false)
  })

  it('fails the push (rather than throwing) when the registry is stale', async () => {
    // Port nothing is listening on — a dead channel server that left its file.
    writeReg({ port: 1, pid: 999999 })
    await expect(pushToChannel(AGENT_ID, 'hello')).resolves.toBe(false)
  })

  it('returns false for a missing agent id', async () => {
    await expect(pushToChannel('', 'hello')).resolves.toBe(false)
    expect(isChannelVerified('')).toBe(false)
  })
})

/**
 * End-to-end handshake: boot the real channel server, confirm it registers
 * unverified, POST a message in, then call amp_channel_ack over MCP stdio and
 * confirm the registry flips to verified.
 */
describe('amp-channel-server handshake', () => {
  const SERVER = fileURLToPath(new URL('../lib/amp-channel-server.mjs', import.meta.url))
  const HS_AGENT = 'test-channel-handshake-0000-1111'
  const HS_FILE = path.join(CHANNELS_DIR, `${HS_AGENT}.json`)

  afterAll(() => { try { fs.unlinkSync(HS_FILE) } catch { /* gone */ } })

  it('registers unverified, then verifies after amp_channel_ack', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')

    try { fs.unlinkSync(HS_FILE) } catch { /* gone */ }

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER],
      env: { ...process.env, AIMAESTRO_AGENT_ID: HS_AGENT } as Record<string, string>,
    })
    const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} })
    await client.connect(transport)

    // The server binds its port and self-registers asynchronously after connect.
    for (let i = 0; i < 50 && !fs.existsSync(HS_FILE); i++) {
      await new Promise((r) => setTimeout(r, 100))
    }

    const initial = JSON.parse(fs.readFileSync(HS_FILE, 'utf8'))
    expect(typeof initial.port).toBe('number')
    // Registered but unproven — deliver() must still send the tmux fallback.
    expect(initial.verified).toBeUndefined()
    expect(isChannelVerified(HS_AGENT)).toBe(false)

    // A push succeeds even though nothing has confirmed receipt. This is
    // exactly the false positive that must not suppress the fallback.
    await expect(pushToChannel(HS_AGENT, 'hello over the channel')).resolves.toBe(true)
    expect(isChannelVerified(HS_AGENT)).toBe(false)

    const tools = await client.listTools()
    expect(tools.tools.map((t) => t.name)).toContain('amp_channel_ack')

    await client.callTool({ name: 'amp_channel_ack', arguments: {} })

    for (let i = 0; i < 50 && !isChannelVerified(HS_AGENT); i++) {
      await new Promise((r) => setTimeout(r, 100))
    }
    expect(isChannelVerified(HS_AGENT)).toBe(true)

    await client.close()
  }, 30_000)
})
