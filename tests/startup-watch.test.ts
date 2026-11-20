/**
 * F044 item 8: a woken program stuck before its input box reads as "startup blocked", not Ready.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { startupBlockedLine, noteStartup, checkStartups, startupBlockedReason, resetStartupWatch, STARTUP_GRACE_MS } from '@/lib/startup-watch'

const INPUT = 'Welcome back!\n\n╭──────────────────╮\n│ > \x1b[2mTry "fix lint"\x1b[0m │\n╰──────────────────╯\n  ? for shortcuts'
const TRUST = ' Do you trust the files in this folder?\n\n /Users/acme/project\n\n ❯ 1. Yes, proceed\n   2. No, exit\n'
const LOGIN = ' Select login method:\n\n ❯ 1. Claude account with subscription\n   2. Anthropic Console account\n'

describe('startupBlockedLine', () => {
  it('reads an input box (empty, with the dim hint, or with text) as Ready', () => {
    expect(startupBlockedLine(INPUT)).toBeNull()
    expect(startupBlockedLine('│ > fix the build │')).toBeNull()
    // Current Claude Code: rules above and below, no side border
    expect(startupBlockedLine('Done.\n\n──────────────────\n❯ \n──────────────────\n  ⏵⏵ bypass permissions on')).toBeNull()
  })
  it('reads a menu holding the keyboard, or no input box, as blocked with its first line', () => {
    expect(startupBlockedLine(TRUST)).toBe('Do you trust the files in this folder?')
    expect(startupBlockedLine(LOGIN)).toBe('Select login method:')
    expect(startupBlockedLine('Error: invalid API key\n')).toBe('Error: invalid API key')
    // The echoed launch command at the top of the screen is not the reason
    expect(startupBlockedLine("rue' OTEL_METRIC_EXPORT_INTERVAL='30000' CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1\nclaude\nError: invalid API key\n")).toBe('Error: invalid API key')
    expect(startupBlockedLine("X_Y=1 claude\nclaude\nWelcome to Claude Code\n\n Choose the text style that looks best with your terminal\n To change this later, run /theme\n\n ❯ ✔ Auto (match terminal)\n     Dark mode\n\n  ⏵⏵ bypass permissions on\n")).toBe('Choose the text style that looks best with your terminal')
    // First-run theme picker: an unnumbered menu cursor, no box around it
    expect(startupBlockedLine(' Choose the text style that looks best with your terminal\n To change this later, run /theme\n ❯ ✔ Auto (match terminal)\n     Dark mode\n')).toBe('Choose the text style that looks best with your terminal')
  })
})

describe('checkStartups', () => {
  const T0 = Date.parse('2026-11-20T12:00:00Z')
  let now = T0
  let pane = TRUST
  let report: { status: string; at: number } | null = null
  const deps = { report: () => report, sessionExists: async () => true, capture: async () => pane, now: () => now }
  beforeEach(() => { resetStartupWatch(); now = T0; pane = TRUST; report = null })

  it('waits the grace time, then reports blocked; clears once the input box shows', async () => {
    noteStartup('a1', 'acme-ops', '/w/acme', T0)
    expect(await checkStartups(deps)).toEqual([])
    now = T0 + STARTUP_GRACE_MS + 1
    expect(await checkStartups(deps)).toEqual(['acme-ops'])
    expect(startupBlockedReason('acme-ops')).toBe('startup blocked: Do you trust the files in this folder?')
    pane = INPUT
    await checkStartups(deps)
    expect(startupBlockedReason('acme-ops')).toBeUndefined()
  })

  it('a hook report after the start ends the watch: the program is up', async () => {
    noteStartup('a1', 'acme-ops', '/w/acme', T0)
    now = T0 + STARTUP_GRACE_MS + 1
    report = { status: 'idle', at: T0 + 30_000 }
    expect(await checkStartups(deps)).toEqual([])
    report = null
    expect(await checkStartups(deps)).toEqual([]) // no longer watched
  })
})
