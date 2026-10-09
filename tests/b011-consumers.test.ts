/**
 * B011: how the server side reads the statuses the hook now writes. 'ended' (SessionEnd)
 * and 'started' (a Codex/Gemini SessionStart) claim nothing about what the agent is
 * doing, and the hookStatus map no longer grows without bound.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/agent-registry', () => ({
  loadAgents: () => [{ id: 'a1', name: 'backend-api', workingDirectory: '/repos/api' }],
}))

import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'b011-consumers-'))
process.env.HOME = tmpHome
vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)

function writeHookFile(cwd: string, status: string, at: number = Date.now()) {
  const dir = path.join(tmpHome, '.aimaestro', 'chat-state')
  fs.mkdirSync(dir, { recursive: true })
  const hash = crypto.createHash('md5').update(cwd).digest('hex').substring(0, 16)
  fs.writeFileSync(path.join(dir, `${hash}.json`), JSON.stringify({ status, cwd, updatedAt: new Date(at).toISOString() }))
}

const { sessionActivity, hookStatus } = await import('@/services/shared-state')
const { getActivity, broadcastActivityUpdate, pruneHookStatusMap, HOOK_STATUS_MAP_MAX, WAITING_STATE_TTL_MS } =
  await import('@/services/sessions-service')
const { isSessionIdle, hasHookReport, idleSource } = await import('@/lib/session-idle')
const { claimsActivity } = await import('@/lib/agent-presence')

beforeEach(() => {
  sessionActivity.clear()
  hookStatus.clear()
  fs.rmSync(path.join(tmpHome, '.aimaestro'), { recursive: true, force: true })
})

describe('claimsActivity', () => {
  it('ended and started claim nothing; every real status does', () => {
    expect(claimsActivity('ended')).toBe(false)
    expect(claimsActivity('started')).toBe(false)
    for (const s of ['active', 'idle', 'waiting_for_input', 'permission_request', 'working']) expect(claimsActivity(s)).toBe(true)
  })
})

describe('getActivity reads an ended / started report as "no report"', () => {
  it.each(['ended', 'started'])('%s: an agent with no terminal does not appear', async (status) => {
    writeHookFile('/repos/api', status)
    expect((await getActivity())['backend-api']).toBeUndefined()
  })

  it('ended: a live terminal is decided by its own output, not by the dead report', async () => {
    writeHookFile('/repos/api', 'ended')
    sessionActivity.set('backend-api', Date.now() - 60_000)
    expect((await getActivity())['backend-api'].status).toBe('idle')
    expect((await getActivity())['backend-api'].hookStatus).toBeUndefined()
  })

  it('still reads a real report', async () => {
    writeHookFile('/repos/api', 'active')
    expect((await getActivity())['backend-api'].status).toBe('active')
  })
})

describe('the wake path treats ended / started as no hook report', () => {
  it.each(['ended', 'started'])('%s falls back to terminal recency', (status) => {
    hookStatus.set('s', { status, at: Date.now() })
    expect(hasHookReport('s')).toBe(false)
    expect(idleSource('s')).toBe('none')
    expect(isSessionIdle('s')).toBe(true) // never seen output: nothing to interrupt
    sessionActivity.set('s', Date.now() - 1000)
    expect(isSessionIdle('s')).toBe(false) // output a second ago: busy, whatever the report said
  })

  it('a SessionEnd broadcast removes the stale "active" entry', () => {
    broadcastActivityUpdate('s', 'active', 'active', undefined, 'a1')
    expect(hookStatus.get('s')?.status).toBe('active')
    broadcastActivityUpdate('s', 'ended', 'ended', undefined, 'a1')
    expect(hookStatus.has('s')).toBe(false)
  })
})

describe('hookStatus map is bounded', () => {
  it('drops entries older than the longest TTL', () => {
    hookStatus.set('old', { status: 'idle', at: Date.now() - WAITING_STATE_TTL_MS - 1000 })
    hookStatus.set('new', { status: 'idle', at: Date.now() })
    pruneHookStatusMap()
    expect(hookStatus.has('old')).toBe(false)
    expect(hookStatus.has('new')).toBe(true)
  })

  it('caps arbitrary session names POSTed to the activity endpoint, keeping the newest', () => {
    for (let i = 0; i < HOOK_STATUS_MAP_MAX + 200; i++) {
      hookStatus.set(`junk-${i}`, { status: 'idle', at: Date.now() - (HOOK_STATUS_MAP_MAX + 200 - i) })
    }
    broadcastActivityUpdate('fresh', 'idle', 'idle')
    expect(hookStatus.size).toBeLessThanOrEqual(HOOK_STATUS_MAP_MAX)
    expect(hookStatus.has('fresh')).toBe(true)
    expect(hookStatus.has('junk-0')).toBe(false)
    expect(hookStatus.has(`junk-${HOOK_STATUS_MAP_MAX + 199}`)).toBe(true)
  })
})
