/**
 * Tests for getActivity()'s hook-state fallback — the "panel never shows agents
 * working" bug reported against v0.38.9 (commit 667ecd8).
 *
 * THE BUG
 *
 * getActivity() iterated `sessionActivity` and nothing else. That map is written
 * by the PTY layer, which only runs while somebody has the agent's terminal open
 * in the dashboard. For an autonomous fleet that is the unusual case — so
 * `GET /api/sessions/activity` returned `{"activity":{}}` with fifteen agents
 * running, one of them twelve minutes into a turn.
 *
 * Hook state was consulted, but only to UPGRADE an entry terminal activity had
 * already created — so an agent with no terminal open could never appear at all,
 * whatever the hook reported.
 *
 * The signal existed the whole time. broadcastActivityUpdate persists it, and its
 * own comment calls it "the only busy/idle signal that exists for an agent nobody
 * is watching". It fed the wake path in lib/session-idle and was never read here.
 *
 * Terminal activity still wins where it exists: it is measured, the hook report is
 * merely claimed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/agent-registry', () => ({
  loadAgents: () => [
    { id: 'a1', name: 'backend-api', workingDirectory: '/repos/api' },
    { id: 'a2', name: 'frontend-web', workingDirectory: '/repos/web' },
  ],
}))

import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

// The hook's file store lives under ~/.aimaestro/chat-state, keyed by a hash of
// the agent's working directory. Point HOME at a temp dir so tests never touch
// the developer's real state.
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-'))
process.env.HOME = tmpHome
vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)

function writeHookFile(cwd: string, status: string, at: number = Date.now()) {
  const dir = path.join(tmpHome, '.aimaestro', 'chat-state')
  fs.mkdirSync(dir, { recursive: true })
  const hash = crypto.createHash('md5').update(cwd).digest('hex').substring(0, 16)
  fs.writeFileSync(
    path.join(dir, `${hash}.json`),
    JSON.stringify({ status, cwd, updatedAt: new Date(at).toISOString() })
  )
}

const { sessionActivity, hookStatus } = await import('@/services/shared-state')
const { getActivity } = await import('@/services/sessions-service')
const { HOOK_STATUS_TTL_MS } = await import('@/lib/session-idle')

beforeEach(() => {
  sessionActivity.clear()
  hookStatus.clear()
  fs.rmSync(path.join(tmpHome, '.aimaestro', 'chat-state'), { recursive: true, force: true })
})

describe('an agent nobody is watching', () => {
  it('shows as active when the hook says it is working', async () => {
    // The reported bug: no terminal open, so sessionActivity is empty.
    hookStatus.set('backend-api', { status: 'active', at: Date.now() })
    const a = await getActivity()
    expect(a['backend-api']?.status).toBe('active')
  })

  it('is not silently dropped just because no terminal is attached', async () => {
    hookStatus.set('backend-api', { status: 'active', at: Date.now() })
    expect(Object.keys(await getActivity())).toContain('backend-api')
  })

  it('shows as idle when the hook says the turn ended', async () => {
    hookStatus.set('backend-api', { status: 'idle', at: Date.now() })
    expect((await getActivity())['backend-api'].status).toBe('idle')
  })

  it.each([
    ['waiting_for_input', 'waiting'],
    ['permission_request', 'waiting'],
  ])('maps hook status %s to %s', async (hook, expected) => {
    hookStatus.set('backend-api', { status: hook, at: Date.now() })
    expect((await getActivity())['backend-api'].status).toBe(expected)
  })

  it('preserves the raw hook status for the UI', async () => {
    hookStatus.set('backend-api', { status: 'permission_request', at: Date.now(), notificationType: 'perm' })
    const a = await getActivity()
    expect(a['backend-api'].hookStatus).toBe('permission_request')
    expect(a['backend-api'].notificationType).toBe('perm')
  })
})

describe('trust boundaries', () => {
  it('ignores a hook report older than the TTL', async () => {
    // A stale report must not show a long-dead agent as working.
    hookStatus.set('backend-api', { status: 'active', at: Date.now() - HOOK_STATUS_TTL_MS - 1000 })
    expect(await getActivity()).toEqual({})
  })

  it('lets TERMINAL activity win over a hook report', async () => {
    // Terminal output is measured; the hook report is claimed.
    sessionActivity.set('backend-api', Date.now())
    hookStatus.set('backend-api', { status: 'idle', at: Date.now() })
    expect((await getActivity())['backend-api'].status).toBe('active')
  })

  it('still upgrades a live terminal to waiting when the hook says so', async () => {
    // Pre-existing behaviour, and a distinction worth keeping straight: the
    // terminal-upgrade path reads the hook's STATE FILE (keyed by cwd hash), not
    // the broadcast map (keyed by session name). Two different stores.
    writeHookFile('/repos/api', 'waiting_for_input')
    sessionActivity.set('backend-api', Date.now())
    expect((await getActivity())['backend-api'].status).toBe('waiting')
  })

  it('reads the state FILE even when the broadcast never arrived', async () => {
    // The hook writes the file with fs.writeFileSync BEFORE it tries to POST, so
    // the file survives a hook process that exits mid-fetch. On the reported
    // estate 0 of 73 broadcasts landed while every file was written correctly —
    // so the indicator must work from the file alone.
    writeHookFile('/repos/api', 'active')
    expect((await getActivity())['backend-api'].status).toBe('active')
  })

  it('does not trust a state file older than the TTL', async () => {
    writeHookFile('/repos/api', 'active', Date.now() - HOOK_STATUS_TTL_MS - 5000)
    expect(await getActivity()).toEqual({})
  })

  it('reports each agent independently', async () => {
    sessionActivity.set('frontend-web', Date.now())
    hookStatus.set('backend-api', { status: 'active', at: Date.now() })
    const a = await getActivity()
    expect(a['backend-api'].status).toBe('active')
    expect(a['frontend-web'].status).toBe('active')
  })

  it('returns an empty map when nothing is running at all', async () => {
    expect(await getActivity()).toEqual({})
  })
})
