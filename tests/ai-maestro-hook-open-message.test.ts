/**
 * Tests for scripts/claude-hooks/ai-maestro-hook.cjs — opening the message a
 * pane notice announces (UserPromptSubmit).
 *
 * The notice typed into the pane carries only the last eight letters and
 * digits of the id and the body's first 400 characters. The hook opens that
 * one message with the session's own amp-inbox / amp-read and adds it as
 * context, so the agent can answer it without a model call to open it.
 * The decision (which message, if any) is pure; the I/O takes an injected
 * runner, so no amp script or server is needed here.
 */

import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const hook = require('../scripts/claude-hooks/ai-maestro-hook.cjs')

const ID = 'msg_1795410615796_qjo20wx'
const REF = hook.messageRefOf(ID) // the last eight letters and digits, as the pane notice shows them
const notice = (ref: string, body = 'Mara asks: which port does the staging server use?') =>
  `[#${ref}] [MESSAGE] Staging question — from build-coordinator — ${body}`
const entry = (id: string, message = 'Mara asks: which port does the staging server use?\n\n# Context\nrules') => ({
  envelope: { id, from: 'build-coordinator', subject: 'Staging question' },
  payload: { type: 'request', message },
})
const READ_OUT = `MESSAGE\nID:       ${ID}\nFrom:     build-coordinator\n\nMara asks: which port does the staging server use?\n\n# Context\nrules\n`

/** A runner standing in for execFile: answers amp-inbox and amp-read, records every call. */
function runner(inbox: unknown[], { read = READ_OUT, failRead = false, failInbox = false } = {}) {
  const calls: Array<[string, string[], number]> = []
  const run = async (cmd: string, args: string[], timeoutMs: number) => {
    calls.push([cmd, args, timeoutMs])
    if (cmd === 'amp-inbox') {
      if (failInbox) throw new Error('amp-inbox: not reachable')
      return JSON.stringify(inbox)
    }
    if (cmd === 'amp-read') {
      if (failRead) throw new Error('amp-read: timed out')
      return read
    }
    throw new Error(`unexpected ${cmd}`)
  }
  return { run, calls }
}

describe('ai-maestro-hook · noticeRefs', () => {
  it('finds the ref of each notice in the prompt', () => {
    expect(hook.noticeRefs(notice('abc12345'))).toEqual(['abc12345'])
    expect(hook.noticeRefs(`${notice('aaaa1111')}\n${notice('bbbb2222')}`)).toEqual(['aaaa1111', 'bbbb2222'])
  })

  it('ignores a prompt without a notice, and non-strings', () => {
    expect(hook.noticeRefs('please check [#abc12345] later')).toEqual([])
    expect(hook.noticeRefs(undefined)).toEqual([])
  })
})

describe('ai-maestro-hook · pickAnnouncedMessage', () => {
  it('picks the one unread message whose ref the notice carries', () => {
    const picked = hook.pickAnnouncedMessage([entry('msg_1795410000000_zzzzzzz'), entry(ID)], notice(REF))
    expect(picked).toMatchObject({ id: ID, ref: REF })
    expect(picked.bodyChars).toBeGreaterThan(0)
  })

  it('gives the id in the form amp-read accepts (underscores)', () => {
    const picked = hook.pickAnnouncedMessage([entry(ID.replace(/_/g, '-'))], notice(REF))
    expect(picked.id).toBe(ID)
  })

  it('opens nothing when no message matches (another agent\'s ref, or already read)', () => {
    expect(hook.pickAnnouncedMessage([entry('msg_1795410000000_zzzzzzz')], notice(REF))).toBeNull()
    expect(hook.pickAnnouncedMessage([], notice(REF))).toBeNull()
  })

  it('opens nothing when two messages share the ref: never a guess', () => {
    expect(hook.pickAnnouncedMessage([entry(ID), entry(`msg_1_${ID.slice(-12)}`)], notice(REF))).toBeNull()
  })

  it('opens nothing when the prompt carries more than one notice', () => {
    expect(hook.pickAnnouncedMessage([entry(ID)], `${notice(REF)}\n${notice('bbbb2222')}`)).toBeNull()
  })

  it('tolerates a malformed inbox', () => {
    expect(hook.pickAnnouncedMessage(null, notice(REF))).toBeNull()
    expect(hook.pickAnnouncedMessage([{}, { envelope: {} }, null], notice(REF))).toBeNull()
  })
})

describe('ai-maestro-hook · openAnnouncedMessage', () => {
  it('opens the message with the session\'s own amp-inbox and amp-read, and gives the whole text', async () => {
    const { run, calls } = runner([entry(ID)])
    const out = await hook.openAnnouncedMessage(notice(REF), { run })
    expect(calls.map(c => [c[0], c[1]])).toEqual([['amp-inbox', ['--json']], ['amp-read', [ID]]])
    // never --id, never another mailbox: the scripts act as this session's agent
    for (const c of calls) expect(c[1]).not.toContain('--id')
    expect(out.text).toContain(`AI Maestro opened the message [#${REF}] for you: ${ID}`)
    expect(out.text).toContain(`\`amp-reply ${ID}\` answers it`)
    expect(out.text).toContain('# Context\nrules')
    expect(out.short).toBe(`The message [#${REF}] is ${ID} (too long to show here). Open it with: amp-read ${ID}`)
  })

  it('does nothing at all for a prompt without exactly one notice', async () => {
    const { run, calls } = runner([entry(ID)])
    expect(await hook.openAnnouncedMessage('hello', { run })).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('does not open a message too long for the context: names its id and the one command instead', async () => {
    const { run, calls } = runner([entry(ID, 'x'.repeat(hook.OPEN_MESSAGE_MAX_CHARS + 1))])
    const out = await hook.openAnnouncedMessage(notice(REF), { run })
    expect(out).toBe(`The message [#${REF}] is ${ID} (too long to show here). Open it with: amp-read ${ID}`)
    expect(calls.map(c => c[0])).toEqual(['amp-inbox'])   // not read, so not marked read
  })

  it('gives the short form when what amp-read shows is too long (an external body is wrapped)', async () => {
    const { run } = runner([entry(ID)], { read: 'y'.repeat(hook.OPEN_MESSAGE_MAX_CHARS) })
    expect(await hook.openAnnouncedMessage(notice(REF), { run })).toContain(`Open it with: amp-read ${ID}`)
  })

  it('names the id when amp-read fails, so one plain command opens it', async () => {
    const { run } = runner([entry(ID)], { failRead: true })
    expect(await hook.openAnnouncedMessage(notice(REF), { run })).toBe(`The message [#${REF}] is ${ID} (not opened yet). Open it with: amp-read ${ID}`)
  })

  it('adds nothing when amp-inbox fails (the notice stays as it was)', async () => {
    const { run } = runner([], { failInbox: true })
    expect(await hook.openAnnouncedMessage(notice(REF), { run })).toBeNull()
  })

  it('stays inside its time budget: no read started with too little time left', async () => {
    let t = 0
    const { run, calls } = runner([entry(ID)])
    const slowInbox = async (cmd: string, args: string[], ms: number) => { const r = await run(cmd, args, ms); t += 2800; return r }
    const out = await hook.openAnnouncedMessage(notice(REF), { run: slowInbox, budgetMs: 3000, now: () => t })
    expect(out).toContain('(not opened yet)')
    expect(calls.map(c => c[0])).toEqual(['amp-inbox'])
  })

  it('gives amp-read only the time left of the budget', async () => {
    let t = 0
    const { run, calls } = runner([entry(ID)])
    const timed = async (cmd: string, args: string[], ms: number) => { const r = await run(cmd, args, ms); if (cmd === 'amp-inbox') t += 1000; return r }
    await hook.openAnnouncedMessage(notice(REF), { run: timed, budgetMs: 3000, now: () => t })
    expect(calls[1][2]).toBe(2000)
  })
})

describe('ai-maestro-hook · joinContext', () => {
  const opened = { text: 'OPENED '.repeat(100), short: 'SHORT' }

  it('puts the opened message in whole when everything fits', () => {
    expect(hook.joinContext([opened, null, 'inbox notice'])).toBe(`${opened.text}\n\ninbox notice`)
  })

  it('falls back to the short form when the context would pass Claude Code\'s 10,000 characters', () => {
    const big = { text: 'z'.repeat(9000), short: 'SHORT' }
    expect(hook.joinContext([big, 'm'.repeat(1500)])).toBe(`SHORT\n\n${'m'.repeat(1500)}`)
  })

  it('is empty when there is nothing to add', () => {
    expect(hook.joinContext([null, null, undefined])).toBe('')
  })
})

describe('ai-maestro-hook · openAnnouncedEnabled', () => {
  it('is on unless AIM_OPEN_ANNOUNCED_MESSAGE=0', () => {
    expect(hook.openAnnouncedEnabled({})).toBe(true)
    expect(hook.openAnnouncedEnabled({ AIM_OPEN_ANNOUNCED_MESSAGE: '1' })).toBe(true)
    expect(hook.openAnnouncedEnabled({ AIM_OPEN_ANNOUNCED_MESSAGE: '0' })).toBe(false)
  })
})
