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
