/**
 * Tests for the defect that made "green" mean nothing: text typed into an
 * agent and never submitted reads back off the pane exactly like text the
 * agent received.
 *
 * Field report (3Metas, ~50 agents): eight of nine agents on one host held
 * staged, unsubmitted text. One had been deaf about eleven hours. Seven were
 * recoverable wake nudges — the mail was still in the inbox — but one was a
 * real instruction with no inbox copy, and it was simply lost. Throughout,
 * stop_reason=end_turn, clean turn durations, lastActive moving from the
 * heartbeat. Every indicator green while the agent could not hear.
 *
 * `capture-pane` includes the input box, and the readback check looked for the
 * message ANYWHERE on the pane, so staged text satisfied it and the pane
 * adapter returned `confirmed` — which also suppressed the retry that would
 * have rescued it.
 *
 * Proof of delivery has to be proof of SUBMISSION: the message must appear
 * above the input box, where a TUI echoes what it accepted.
 */

import { describe, it, expect } from 'vitest'
import { splitPaneAtInput, paneSubmitted, paneStaged } from '@/lib/notification-service'

const REF = '[#3bk2096t]'

/** Claude Code after the prompt was accepted: it is in the transcript, box empty. */
const SUBMITTED = `
> ${REF} [MESSAGE] From: alice - deploy failed

  I'll take a look at that now.

╭──────────────────────────────────────╮
│ >                                    │
╰──────────────────────────────────────╯
`

/** The failure: the text sits in the input box, unsubmitted. */
const STAGED = `
  Previous turn output here.

╭──────────────────────────────────────╮
│ > ${REF} [MESSAGE] From: alice - deploy failed
╰──────────────────────────────────────╯
`

describe('splitPaneAtInput', () => {
  it('splits at the last prompt line', () => {
    const { accepted, input } = splitPaneAtInput(STAGED)
    expect(input).toContain(REF)
    expect(accepted).not.toContain(REF)
  })

  it('treats the whole pane as accepted when there is no prompt line', () => {
    const pane = 'just some output\nwith no prompt'
    const { accepted, input } = splitPaneAtInput(pane)
    expect(accepted).toBe(pane)
    expect(input).toBe('')
  })

  it('uses the LAST prompt, not the first', () => {
    // A transcript is full of earlier prompt lines; only the bottom one is the
    // live input box.
    const pane = `> old message one\n> old message two\n╭───╮\n│ > staged text\n╰───╯`
    expect(splitPaneAtInput(pane).input).toContain('staged text')
    expect(splitPaneAtInput(pane).accepted).toContain('old message two')
  })
})

describe('paneSubmitted — proof of submission, not of presence', () => {
  it('is true when the message is above the input box', () => {
    expect(paneSubmitted(SUBMITTED, REF)).toBe(true)
  })

  it('is FALSE when the message is only staged in the input box', () => {
    // The whole bug in one assertion: the old check was `pane.includes(ref)`,
    // which is true here, and returning confirmed for this state is what left
    // eight agents deaf while reporting healthy.
    expect(paneSubmitted(STAGED, REF)).toBe(false)
  })

  it('is false when the message is not on the pane at all', () => {
    expect(paneSubmitted('unrelated output\n> ', REF)).toBe(false)
  })

  it('survives the pane hard-wrapping the ref mid-token', () => {
    const wrapped = `> [#3bk20\n96t] [MESSAGE] From: alice\n╭───╮\n│ > \n╰───╯`
    expect(paneSubmitted(wrapped, REF)).toBe(true)
  })
})

describe('paneStaged — positive evidence of NON-delivery', () => {
  it('is true when our text is sitting in the input box', () => {
    expect(paneStaged(STAGED, REF)).toBe(true)
  })

  it('is false once the text has been accepted', () => {
    expect(paneStaged(SUBMITTED, REF)).toBe(false)
  })

  it('recognises a bare shell prompt holding the text', () => {
    // Not every pane is a TUI. A shell with the echo wrapper typed but not run
    // is the same failure wearing different chrome.
    const shell = `$ ls\nfile.txt\n$ echo '${REF} [MESSAGE] From: alice'`
    expect(paneStaged(shell, REF)).toBe(true)
    expect(paneSubmitted(shell, REF)).toBe(false)
  })

  it('recognises a ❯ prompt', () => {
    expect(paneStaged(`❯ ${REF} hello`, REF)).toBe(true)
  })
})


/**
 * The alternate screen — a real capture, not a hand-written mock.
 *
 * 3Metas raised this against the fix itself, and it is the right question to
 * ask: the proof requires the message to appear ABOVE the input box, and an
 * agent running Claude Code's fullscreen renderer reports `history_size=0`.
 * Their `3m-leads` is in exactly that state — it is their sandboxed manual
 * launch, so it never received `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` — and
 * it owns their live customer contact route. Their concern:
 *
 *   "your new proof-of-submission readback has no scrollback to read on the
 *    one agent that owns our live customer contact route."
 *
 * Reasonable, and empirically wrong. Reproduced locally (tmux session with
 * Claude Code 2.1.252 launched without the env var: `alternate_on=1,
 * history_size=0, 80x24` — their exact state), sent the notification through
 * the same two-step send, and captured the pane. Both fixtures below are that
 * raw capture.
 *
 * `history_size=0` removes the SCROLLBACK, not the screen. `capture-pane`
 * still returns the visible screen, the fullscreen renderer draws the
 * submitted prompt above its input box like any other, and the check runs
 * within a second of sending — so the message is still on screen when we look.
 *
 * The residual risk is narrower and worth naming: if a burst of output scrolls
 * the message off the visible screen before the poll, there is no history to
 * fall back on, so it reads as "not seen". That produces a duplicate nudge via
 * the retry queue — never a lost message, and never a spurious clear, because
 * the needle is not in the input box.
 */
describe('alternate screen (fullscreen renderer) — captured from a live agent', () => {
  const ALT_SUBMITTED = [
    '',
    ' ▐▛███▛█   Claude Code v2.1.252',
    '▝▜██████▀  Opus 5 (1M context) · Claude Max',
    '  ▝▝ ▝▝    /…/T/tmp.BAOVMPI8vL',
    '',
    '⚠ 1 MCP server needs authentication · run /mcp',
    '',
    '❯ [#zz9alt77] [MESSAGE] From: tester - alt screen readback probe - reply with',
    '  the single word ACK',
    '',
    '⏺ ACK',
    '',
    '✻ Baked for 2s · done 3:29 PM',
    '',
    '                                        ✔ Update installed · Restart to update',
    '─'.repeat(80),
    '❯ ',
    '─'.repeat(80),
    '  AMP: not configured (run amp-init)                                       /rc',
    '  Opus 5 (1M context) | ctx 6% | $0.63',
    '  ⏸ plan mode on (shift+tab to cycle) · ← 1 agent',
  ].join('\n')

  const ALT_STAGED = [
    '',
    '⚠ 1 MCP server needs authentication · run /mcp',
    '',
    '✻ Baked for 2s · done 3:29 PM',
    '',
    '                                        ✔ Update installed · Restart to update',
    '─'.repeat(80),
    '❯ [#zz9stg88] staged probe never submitted',
    '─'.repeat(80),
    '  AMP: not configured (run amp-init)                                       /rc',
    '  Opus 5 (1M context) | ctx 6% | $0.63',
    '  ⏸ plan mode on (shift+tab to cycle)',
  ].join('\n')

  it('proves submission with no scrollback at all', () => {
    expect(paneSubmitted(ALT_SUBMITTED, '[#zz9alt77]')).toBe(true)
    expect(paneStaged(ALT_SUBMITTED, '[#zz9alt77]')).toBe(false)
  })

  it('still catches staged text in the fullscreen input box', () => {
    expect(paneStaged(ALT_STAGED, '[#zz9stg88]')).toBe(true)
    expect(paneSubmitted(ALT_STAGED, '[#zz9stg88]')).toBe(false)
  })

  it('splits at the input box, not at the echoed prompt above it', () => {
    // Both lines begin with ❯. Taking the FIRST prompt line would put the
    // submitted message inside the "input" region and invert the verdict.
    const { input } = splitPaneAtInput(ALT_SUBMITTED)
    expect(input).not.toContain('zz9alt77')
    expect(input).toContain('AMP: not configured')
  })

  it('is not confused by the status footer below the input box', () => {
    // The footer sits AFTER the input line, so anything matched there belongs
    // to the input region — which is why the needle must be a per-message ref
    // and not a generic string like "MESSAGE".
    expect(splitPaneAtInput(ALT_SUBMITTED).accepted).toContain('the single word ACK')
  })
})
