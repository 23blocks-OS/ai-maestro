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

function writeHookFile(cwd: string, status: string, at: number = Date.now(), notificationType?: string) {
  const dir = path.join(tmpHome, '.aimaestro', 'chat-state')
  fs.mkdirSync(dir, { recursive: true })
  const hash = crypto.createHash('md5').update(cwd).digest('hex').substring(0, 16)
  fs.writeFileSync(
    path.join(dir, `${hash}.json`),
    JSON.stringify({ status, cwd, updatedAt: new Date(at).toISOString(), ...(notificationType ? { notificationType } : {}) })
  )
}

const { sessionActivity, hookStatus } = await import('@/services/shared-state')
const { getActivity } = await import('@/services/sessions-service')
const { HOOK_STATUS_TTL_MS } = await import('@/lib/session-idle')
const { WAITING_STATE_TTL_MS } = await import('@/services/sessions-service')

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
    ['waiting_for_input', 'permission_prompt', 'waiting'],
    ['permission_request', undefined, 'waiting'],
    // Claude Code's idle_prompt only means "still idle after a minute": the
    // agent is done and holding, not blocked on the user (lib/agent-presence.ts)
    ['waiting_for_input', 'idle_prompt', 'idle'],
  ])('maps hook status %s (%s) to %s', async (hook, notificationType, expected) => {
    hookStatus.set('backend-api', { status: hook, at: Date.now(), ...(notificationType ? { notificationType } : {}) })
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

  it('with no hook STATE FILE, the per-agent report still beats terminal redraws', async () => {
    // The map is keyed by agent, so it is right even when the agent works in a
    // subfolder whose state file pass 1 never reads (docs/AGENT-STATUS.md §6, 2 and 3).
    sessionActivity.set('backend-api', Date.now())
    hookStatus.set('backend-api', { status: 'idle', at: Date.now() })
    expect((await getActivity())['backend-api'].status).toBe('idle')
  })

  it('with no hook report at all, terminal activity decides (Codex, a shell)', async () => {
    sessionActivity.set('backend-api', Date.now())
    expect((await getActivity())['backend-api'].status).toBe('active')
  })

  it('still upgrades a live terminal to waiting when the hook says so', async () => {
    // Pre-existing behaviour, and a distinction worth keeping straight: the
    // terminal-upgrade path reads the hook's STATE FILE (keyed by cwd hash), not
    // the broadcast map (keyed by session name). Two different stores.
    writeHookFile('/repos/api', 'waiting_for_input', Date.now(), 'permission_prompt')
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

describe('the hook is the authority over terminal redraws (v0.45.2)', () => {
  it('an idle agent with an open terminal stays idle: redraws are not work', async () => {
    // Claude Code redraws its screen and status line while idle; with a
    // terminal open that used to show idle agents green for minutes.
    writeHookFile('/repos/api', 'idle', Date.now() - 30_000)
    sessionActivity.set('backend-api', Date.now())
    expect((await getActivity())['backend-api'].status).toBe('idle')
  })

  it('a turn that started shows as active at once', async () => {
    writeHookFile('/repos/api', 'active')
    expect((await getActivity())['backend-api'].status).toBe('active')
  })

  it('stays "needs you" while the permission dialog sits unanswered', async () => {
    writeHookFile('/repos/api', 'permission_request', Date.now() - 20_000)
    sessionActivity.set('backend-api', Date.now() - 60_000) // no output since
    expect((await getActivity())['backend-api'].status).toBe('waiting')
  })

  it('turns back to active once the agent resumes after you approve', async () => {
    writeHookFile('/repos/api', 'permission_request', Date.now() - 20_000)
    sessionActivity.set('backend-api', Date.now()) // output well after the report
    expect((await getActivity())['backend-api'].status).toBe('active')
  })

  it('uses terminal activity only when there is no hook report', async () => {
    sessionActivity.set('backend-api', Date.now())
    expect((await getActivity())['backend-api'].status).toBe('active')
  })
})

describe('staleness bounds', () => {
  const HOURS = 60 * 60 * 1000

  it('drops a "waiting" report older than 24h', async () => {
    // v0.38.10 surfaced hook state in the sidebar and 56 of 67 agents on one host
    // showed a pulsing amber "needs you" badge from reports over a week old, the
    // oldest from 12 January. Permanent amber teaches people to ignore amber.
    writeHookFile('/repos/api', 'waiting_for_input', Date.now() - 25 * HOURS)
    expect(await getActivity()).toEqual({})
  })

  it('keeps a "waiting" report from overnight', async () => {
    // Genuinely blocked since yesterday evening must still be flagged this morning.
    writeHookFile('/repos/api', 'waiting_for_input', Date.now() - 14 * HOURS, 'permission_prompt')
    expect((await getActivity())['backend-api'].status).toBe('waiting')
  })

  it('expires "active" much sooner than "waiting"', async () => {
    // Working is a claim about right now; blocked persists until answered.
    writeHookFile('/repos/api', 'active', Date.now() - 2 * HOURS)
    expect(await getActivity()).toEqual({})
    expect(WAITING_STATE_TTL_MS).toBeGreaterThan(HOOK_STATUS_TTL_MS)
  })

  it('does not label a LIVE terminal "waiting" on a months-old report', async () => {
    writeHookFile('/repos/api', 'waiting_for_input', Date.now() - 60 * 24 * HOURS)
    sessionActivity.set('backend-api', Date.now())
    expect((await getActivity())['backend-api'].status).toBe('active')
  })
})

describe('an agent that goes quiet and comes back', () => {
  const HOURS = 60 * 60 * 1000

  it('reappears as soon as it reports again — expiry is age, not a blocklist', async () => {
    // Silent for 48h: gone from the report.
    writeHookFile('/repos/api', 'waiting_for_input', Date.now() - 48 * HOURS)
    expect(await getActivity()).toEqual({})

    // It picks up a task. The hook fires UserPromptSubmit and rewrites the file.
    writeHookFile('/repos/api', 'active')
    expect((await getActivity())['backend-api'].status).toBe('active')
  })

  it('comes back through the broadcast map too, for an agent on another host', async () => {
    hookStatus.set('backend-api', { status: 'idle', at: Date.now() - 48 * HOURS })
    expect(await getActivity()).toEqual({})

    hookStatus.set('backend-api', { status: 'active', at: Date.now() })
    expect((await getActivity())['backend-api'].status).toBe('active')
  })

  it('nothing is cached — every call recomputes from the two stores', async () => {
    writeHookFile('/repos/api', 'active')
    expect((await getActivity())['backend-api'].status).toBe('active')
    writeHookFile('/repos/api', 'idle')
    expect((await getActivity())['backend-api'].status).toBe('idle')
  })
})

describe('status comes from the hook only (docs/AGENT-STATUS.md §6)', () => {
  it('a transcript modified with no new turn does not make an idle agent Working', async () => {
    const t = path.join(tmpHome, 't.jsonl')
    fs.writeFileSync(t, '{}')
    const at = Date.now() - 60 * 60_000
    const dir = path.join(tmpHome, '.aimaestro', 'chat-state')
    fs.mkdirSync(dir, { recursive: true })
    const hash = crypto.createHash('md5').update('/repos/api').digest('hex').substring(0, 16)
    fs.writeFileSync(path.join(dir, `${hash}.json`), JSON.stringify({
      status: 'waiting_for_input', notificationType: 'idle_prompt', cwd: '/repos/api',
      updatedAt: new Date(at).toISOString(), transcriptPath: t,
    }))
    expect((await getActivity())['backend-api']?.status).toBe('idle')
    sessionActivity.set('backend-api', Date.now() - 10_000) // terminal open, quiet
    expect((await getActivity())['backend-api']?.status).toBe('idle')
  })

  it('with a terminal open, a newer per-agent report beats an older folder file', async () => {
    writeHookFile('/repos/api', 'idle', Date.now() - 60_000)
    hookStatus.set('backend-api', { status: 'active', at: Date.now() })
    sessionActivity.set('backend-api', Date.now() - 10_000)
    expect((await getActivity())['backend-api']?.status).toBe('active')
  })
})

describe('state files in subfolders (docs/AGENT-STATUS.md §6, defect 2)', () => {
  const writeAt = (cwd: string, status: string, at: number, notificationType?: string) => {
    const dir = path.join(tmpHome, '.aimaestro', 'chat-state')
    fs.mkdirSync(dir, { recursive: true })
    const hash = crypto.createHash('md5').update(cwd).digest('hex').substring(0, 16)
    fs.writeFileSync(path.join(dir, `${hash}.json`), JSON.stringify({ status, cwd, updatedAt: new Date(at).toISOString(), ...(notificationType && { notificationType }) }))
  }

  it('the newest file in a subfolder wins over an older top-folder file (report lost in a restart)', async () => {
    writeAt('/repos/api', 'active', Date.now() - 5 * 60_000)
    writeAt('/repos/api/services/x', 'waiting_for_input', Date.now() - 60_000, 'idle_prompt')
    expect((await getActivity())['backend-api']?.status).toBe('idle')
  })

  it('a folder that only starts with the same letters is not a subfolder', async () => {
    writeAt('/repos/api', 'idle', Date.now() - 5 * 60_000)
    writeAt('/repos/api-v2', 'active', Date.now())
    expect((await getActivity())['backend-api']?.status).toBe('idle')
  })

  it('sees a file rewritten in place', async () => {
    writeAt('/repos/web', 'active', Date.now() - 1000)
    expect((await getActivity())['frontend-web']?.status).toBe('active')
    writeAt('/repos/web', 'idle', Date.now())
    const f = path.join(tmpHome, '.aimaestro', 'chat-state', `${crypto.createHash('md5').update('/repos/web').digest('hex').substring(0, 16)}.json`)
    fs.utimesSync(f, new Date(), new Date(Date.now() + 5000)) // force a different mtime
    expect((await getActivity())['frontend-web']?.status).toBe('idle')
  })
})

describe('agents of other hosts, from /mesh (docs/SPEC-MESH-SYNC.md)', () => {
  it('are in the feed as their host sent them; a local agent wins; ?local=true leaves them out', async () => {
    const { peerActivity } = await import('@/services/shared-state')
    peerActivity.set('mac-mini', { connected: true, seq: 1, okAt: Date.now(), items: {
      dahlia: { status: 'active', hookStatus: 'active', lastActivity: 'x' },
      'backend-api': { status: 'active' },
    } })
    peerActivity.set('gone', { connected: false, seq: 0, okAt: 0, items: { ghost: { status: 'active' } } })
    hookStatus.set('backend-api', { status: 'idle', at: Date.now() })
    try {
      const all = await getActivity()
      expect(all.dahlia).toMatchObject({ status: 'active', hostId: 'mac-mini' })
      expect(all['backend-api'].status).toBe('idle')
      expect(all.ghost).toBeUndefined()
      expect((await getActivity({ localOnly: true })).dahlia).toBeUndefined()
    } finally { peerActivity.clear() }
  })
})

describe('the /status socket sends what the fetch gives (docs/AGENT-STATUS.md §6, defect 6)', () => {
  it('a permission request the pane showed to be over goes out as the fetch reports it, not as Needs you', async () => {
    const { statusSubscribers, observedExpired } = await import('@/services/shared-state')
    const { broadcastActivityUpdate } = await import('@/services/sessions-service')
    const sent: any[] = []
    const ws: any = { readyState: 1, send: (m: string) => sent.push(JSON.parse(m)) }
    statusSubscribers.add(ws)
    try {
      // The hook's file says permission_request (observed); the sweep recorded it as over
      const at = Date.now() - 1000
      const dir = path.join(tmpHome, '.aimaestro', 'chat-state')
      fs.mkdirSync(dir, { recursive: true })
      const hash = crypto.createHash('md5').update('/repos/api').digest('hex').substring(0, 16)
      fs.writeFileSync(path.join(dir, `${hash}.json`), JSON.stringify({ status: 'permission_request', observed: true, cwd: '/repos/api', updatedAt: new Date(at).toISOString() }))
      observedExpired.set('backend-api', { at, status: 'active' })

      broadcastActivityUpdate('backend-api', 'idle', 'idle', undefined, 'a1')
      await new Promise(r => setTimeout(r, 20))
      const fetched = (await getActivity())['backend-api']
      const update = sent.filter(m => m.type === 'status_update').at(-1)
      expect(update.status).toBe(fetched.status)
      expect(update.hookStatus).toBe(fetched.hookStatus)
    } finally {
      statusSubscribers.delete(ws)
      observedExpired.clear()
    }
  })

  it('a session that ended (no entry in the feed) still goes out as reported', async () => {
    const { statusSubscribers } = await import('@/services/shared-state')
    const { broadcastActivityUpdate } = await import('@/services/sessions-service')
    const sent: any[] = []
    const ws: any = { readyState: 1, send: (m: string) => sent.push(JSON.parse(m)) }
    statusSubscribers.add(ws)
    try {
      broadcastActivityUpdate('frontend-web', 'ended', 'ended')
      await new Promise(r => setTimeout(r, 20))
      expect(sent.at(-1)).toMatchObject({ type: 'status_update', sessionName: 'frontend-web', hookStatus: 'ended' })
    } finally { statusSubscribers.delete(ws) }
  })
})
