import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { formatStatusRowText } from '@/lib/status-format'
import type { StatusSnapshot } from '@/lib/transcript-snapshot'

/**
 * The chat header and the terminal status line must say the same thing. The
 * header's text is built by lib/status-format.ts (formatStatusRowText); the
 * terminal's is row 2 of amp-statusline.sh, run here the way Claude Code runs it:
 * JSON on stdin, COLUMNS in the environment.
 *
 * The script comes from the plugin submodule, which is released separately. Until
 * the pinned script prints the cache state ("cache warm"), the parity test is
 * skipped with a message; the contract test below always runs.
 */

const SCRIPT = path.join(__dirname, '..', 'plugin', 'plugins', 'ai-maestro', 'scripts', 'amp-statusline.sh')
const scriptText = fs.existsSync(SCRIPT) ? fs.readFileSync(SCRIPT, 'utf8') : ''
const scriptHasCache = scriptText.includes('cache warm')

if (!scriptHasCache) {
  console.warn('[status-line-parity] SKIPPED: the plugin submodule amp-statusline.sh does not print "cache warm" yet. Run again after the plugin release that adds it.')
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

const MIN = 60_000

interface Case {
  name: string
  /** What Claude Code hands the status line */
  warm: boolean
  expiresInMin: number
  effort?: string
}

const CASES: Case[] = [
  { name: 'warm cache, effort high, 5 minutes idle', warm: true, expiresInMin: 12.4, effort: 'high' },
  { name: 'cold cache', warm: false, expiresInMin: -3, effort: 'high' },
  { name: 'a model with no effort', warm: true, expiresInMin: 12.4 },
]

const IDLE_MIN = 5.4

function runScript(c: Case, now: number): string {
  const transcript = path.join(dir, `t-${Math.random().toString(36).slice(2)}.jsonl`)
  fs.writeFileSync(transcript, '{}\n')
  const mtime = new Date(now - IDLE_MIN * MIN)
  fs.utimesSync(transcript, mtime, mtime)

  const input = {
    model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' },
    workspace: { current_dir: dir },
    cost: { total_cost_usd: 65.78 },
    context_window: { used_percentage: 16, total_input_tokens: 160_000, context_window_size: 1_000_000 },
    exceeds_200k_tokens: false,
    ...(c.effort ? { effort: { level: c.effort } } : {}),
    prompt_cache: {
      warm: c.warm, caching_observed: true, ttl: '1h',
      expires_at: Math.round((now + c.expiresInMin * MIN) / 1000),
    },
    transcript_path: transcript,
    session_id: 'parity',
  }
  const home = fs.mkdtempSync(path.join(dir, 'home-'))
  const r = spawnSync('bash', [SCRIPT], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    // An agent identity in the developer's environment only changes row 1; clear it anyway
    env: { ...process.env, HOME: home, COLUMNS: '200', AMP_MAESTRO_URL: 'http://127.0.0.1:9', AMP_AGENT_ID: '', CLAUDE_AGENT_NAME: '', TMUX: '' },
    timeout: 20_000,
  })
  expect(r.status).toBe(0)
  // eslint-disable-next-line no-control-regex
  const lines = r.stdout.replace(/\x1b\[[0-9;]*m/g, '').split('\n')
  return lines[1]
}

function snapshotFor(c: Case, now: number): StatusSnapshot {
  return {
    model: 'claude-opus-5-5', modelName: 'Opus 5.5',
    contextTokens: 160_000, contextWindow: 1_000_000, contextApprox: false, contextPercent: 16,
    compact: 'soon',
    cost: 65.78,
    ...(c.effort ? { effort: c.effort } : {}),
    cacheWarm: c.warm,
    cacheExpiresAt: now + c.expiresInMin * MIN,
    asOf: now,
    lastTurnAt: now - IDLE_MIN * MIN,
    source: 'reported',
  }
}

describe('the chat header row (always)', () => {
  it('reads the way the terminal row 2 is specified to read', () => {
    const now = Date.now()
    expect(formatStatusRowText(snapshotFor(CASES[0], now), now)).toBe(
      'Opus 5.5 | ctx 160k (16%) · /compact soon | $65.78 | effort high | cache warm 12m | last turn 5m ago')
    expect(formatStatusRowText(snapshotFor(CASES[1], now), now)).toBe(
      'Opus 5.5 | ctx 160k (16%) · /compact soon | $65.78 | effort high | cache cold | last turn 5m ago')
    expect(formatStatusRowText(snapshotFor(CASES[2], now), now)).toBe(
      'Opus 5.5 | ctx 160k (16%) · /compact soon | $65.78 | cache warm 12m | last turn 5m ago')
  })

  it('adds the permission mode in the header only, after the effort', () => {
    const now = Date.now()
    const snap = { ...snapshotFor(CASES[0], now), mode: 'acceptEdits' }
    expect(formatStatusRowText(snap, now, { includeMode: true })).toContain('effort high | mode accept edits | cache warm')
    expect(formatStatusRowText(snap, now)).not.toContain('mode')
  })

  it('prints the warning mark for /compact now, as the terminal does', () => {
    const now = Date.now()
    const snap = { ...snapshotFor(CASES[0], now), contextTokens: 210_000, contextPercent: 21, compact: 'now' as const }
    expect(formatStatusRowText(snap, now)).toContain('ctx 210k (21%) · ⚠ /compact now: 2× cost')
  })
})

describe.skipIf(!scriptHasCache)('parity with the terminal status line (amp-statusline.sh row 2)', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const now = Date.now()
      expect(runScript(c, now)).toBe(formatStatusRowText(snapshotFor(c, now), now))
    })
  }
})
