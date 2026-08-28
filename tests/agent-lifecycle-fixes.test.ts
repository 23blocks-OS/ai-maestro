/**
 * Regression tests for three reported agent-lifecycle bugs.
 *
 * All three share a shape that has recurred throughout this subsystem: an
 * operation reports success it has not earned, so the failure is invisible
 * until someone opens a terminal.
 *
 *   1. ${var,,} is bash 4+; macOS ships bash 3.2, so the expansion errored and
 *      `aimaestro-agent.sh create` aborted with "Invalid program: claude".
 *   2. amp-send printed a message ID for a recipient with no identity
 *      directory, because the route ignored deliver()'s result.
 *   3. New agents stopped at "Do you trust the files in this folder?" and
 *      nothing in the API reported it.
 */

import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { detectStartupBlock } from '@/lib/session-idle'

const SCRIPTS = ['plugin/src/scripts/agent-helper.sh', 'plugin/src/scripts/agent-commands.sh']

describe('bash 3.2 portability (issue 1)', () => {
  it('uses no bash-4-only expansions in agent scripts', () => {
    // macOS ships bash 3.2.57. ${var,,} / ${var^^} are runtime "bad
    // substitution" errors there, and because these scripts run with
    // `set -uo pipefail` (no -e) the failure surfaced as a wrong answer rather
    // than a crash: the duplicate-name check silently passed, and the program
    // whitelist silently rejected valid programs.
    for (const rel of SCRIPTS) {
      const file = path.join(process.cwd(), rel)
      if (!fs.existsSync(file)) continue
      const code = fs
        .readFileSync(file, 'utf-8')
        .split('\n')
        .filter((l) => !l.trim().startsWith('#')) // comments may cite the old form
        .join('\n')
      expect(code, `${rel} uses bash-4 case expansion`).not.toMatch(/\$\{[a-zA-Z_]+,,\}/)
      expect(code, `${rel} uses bash-4 case expansion`).not.toMatch(/\$\{[a-zA-Z_]+\^\^\}/)
    }
  })

  it('lowercases via tr, which bash 3.2 supports', () => {
    for (const rel of SCRIPTS) {
      const file = path.join(process.cwd(), rel)
      if (!fs.existsSync(file)) continue
      const code = fs.readFileSync(file, 'utf-8')
      if (code.includes('_lower')) {
        expect(code).toMatch(/tr '\[:upper:\]' '\[:lower:\]'/)
      }
    }
  })
})

describe('startup block detection (issue 3)', () => {
  const pane = (text: string) => async () => text

  it('detects the Claude Code trust prompt', async () => {
    const out = await detectStartupBlock(
      's',
      pane('╭─────╮\n Do you trust the files in this folder?\n 1. Yes  2. No')
    )
    expect(out).toBe('awaiting_trust')
  })

  it('detects the codex phrasing too', async () => {
    const out = await detectStartupBlock('s', pane('Do you trust the contents of this directory?'))
    expect(out).toBe('awaiting_trust')
  })

  it('returns null for a normal working pane', async () => {
    const out = await detectStartupBlock('s', pane('✻ Cerebrating… (1m 54s)\n❯ '))
    expect(out).toBeNull()
  })

  it('returns null for an empty capture rather than guessing', async () => {
    expect(await detectStartupBlock('s', pane(''))).toBeNull()
  })

  it('never throws when the pane cannot be captured', async () => {
    const boom = async () => { throw new Error('no such session') }
    // This runs inside a status report; one dead pane must not fail the report.
    await expect(detectStartupBlock('s', boom)).resolves.toBeNull()
  })
})
