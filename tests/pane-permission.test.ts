import { describe, it, expect } from 'vitest'
import { parsePermissionMenu } from '@/lib/pane-permission.mjs'

// Build a realistic captured pane: a long tool preview, the question, a 6-option
// menu, the footer, then trailing pane rows (a tall window). Option 1 sits far
// above the bottom of the capture — the exact condition the old fixed 45-line
// window dropped it.
function tallPrompt() {
  const preview = Array.from({ length: 40 }, (_, i) => `  src/very/long/path/segment/file-${i}.ts`)
  const trailing = Array.from({ length: 15 }, () => '')
  return [
    ...preview,
    'Do you want to proceed with this command?',
    '❯ 1. Yes',
    "  2. Yes, and don't ask again this session",
    '  3. Yes, allow all edits this session',
    '  4. No, and tell Claude what to do differently',
    '  5. No, cancel',
    '  6. Explain this command first',
    '  esc to cancel · tab to amend',
    ...trailing,
  ].join('\n')
}

describe('parsePermissionMenu (pane scraper)', () => {
  it('keeps option 1 on a tall prompt (the bug)', () => {
    const r = parsePermissionMenu(tallPrompt())
    expect(r).not.toBeNull()
    expect(r!.options.map((o: any) => o.key)).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(r!.options[0]).toMatchObject({ key: '1', label: 'Yes', value: 'yes' })
    expect(r!.options[3].value).toBe('no') // "No, and tell Claude…"
  })

  it('still parses a small 2-option menu', () => {
    const t = ['Do you want to proceed?', '❯ 1. Yes', '  2. No, tell Claude what to do differently'].join('\n')
    const r = parsePermissionMenu(t)
    expect(r!.options.map((o: any) => o.key)).toEqual(['1', '2'])
    expect(r!.options[0].label).toBe('Yes')
  })

  it('rejects a truncated menu that lost option 1', () => {
    const t = [
      'Do you want to proceed?',
      '  2. Yes, and don\'t ask again',
      '  3. Yes',
      '  4. No',
      '  esc to cancel',
    ].join('\n')
    expect(parsePermissionMenu(t)).toBeNull()
  })

  it('rejects a gapped menu (mangled middle option)', () => {
    const t = ['Do you want to proceed?', '❯ 1. Yes', '  2. Maybe', '  4. No', '  esc to cancel'].join('\n')
    expect(parsePermissionMenu(t)).toBeNull()
  })

  it('truncates a long label instead of dropping it (no hole)', () => {
    const long = 'Use the payments service '.repeat(12) // > 200 chars
    const t = ['Do you want to proceed?', '❯ 1. Yes', `  2. ${long}`, '  3. No', '  esc to cancel'].join('\n')
    const r = parsePermissionMenu(t)
    expect(r!.options.map((o: any) => o.key)).toEqual(['1', '2', '3'])
    expect(r!.options[1].label.length).toBeLessThanOrEqual(200)
    expect(r!.options[1].label.endsWith('…')).toBe(true)
  })

  it('ignores a prose numbered list with no active prompt', () => {
    const t = ['Here are the steps:', '1. First do this', '2. Then that', '3. Finally this', 'and that is all.'].join('\n')
    expect(parsePermissionMenu(t)).toBeNull()
  })

  it('ignores an older menu in scrollback, picks the live one', () => {
    const t = [
      'Do you want to proceed?', '  1. Yes (old)', '  2. No (old)', '', 'lots of later output', '',
      'Do you want to proceed?', '❯ 1. Yes', '  2. No, tell Claude', '  esc to cancel',
    ].join('\n')
    const r = parsePermissionMenu(t)
    expect(r!.options.map((o: any) => o.key)).toEqual(['1', '2'])
    expect(r!.options[1].label).toContain('No, tell Claude')
  })

  it('detects a menu whose ❯ selector is the only active signal (no footer phrase)', () => {
    const t = ['  1. Yes', '❯ 2. No, tell Claude'].join('\n')
    const r = parsePermissionMenu(t)
    expect(r).not.toBeNull()
    expect(r!.options.map((o: any) => o.key)).toEqual(['1', '2'])
  })

  it('tolerates wrapped label / continuation lines between options', () => {
    const t = [
      'Do you want to proceed?',
      '❯ 1. Yes, run the command',
      '     (this executes the full script)',
      '  2. No, tell Claude what to do differently',
      '  esc to cancel',
    ].join('\n')
    const r = parsePermissionMenu(t)
    expect(r!.options.map((o: any) => o.key)).toEqual(['1', '2'])
    expect(r!.options[0].label).toBe('Yes, run the command')
  })
})

/**
 * A menu that has scrolled into history is not a live prompt.
 *
 * Reported 15 September 2026, after four releases spent fixing the WRONG card.
 * The question panel kept reappearing on every reload and every tab switch, and
 * the transcript said plainly that it had been answered 46 messages earlier.
 *
 * It was not the transcript card at all. `detectPermissionFromPane` scrapes 200
 * lines of pane scrollback, `parsePermissionMenu` matched a long-dead six-option
 * question inside it, and the server MANUFACTURED a hookState with `options` —
 * which both chat renderers draw as live buttons. The same false positive then
 * convinced `sendChatMessage` a permission was pending and refused every message.
 *
 * The old "is this active?" check ran from the menu to the END of the capture, so
 * any `esc to cancel` or leftover `❯ 1.` selector below a dead menu satisfied it.
 * On a busy agent with 200 lines of history that is close to guaranteed.
 *
 * The tell: if the agent has SPOKEN since the menu, the menu is over.
 */
describe('a menu that scrolled into history', () => {
  const MENU = [
    '● Felipe needs the cuenta de cobro signed before 12:00 — do you want it handled?',
    '',
    '❯ 1. He photographs his signature, I place it (Recommended)',
    '  2. I send him the how-to, he signs it himself',
    '  3. You call him',
    '  4. Ask Calop for an extension',
    '  5. Type something.',
    '  6. Chat about this',
    '',
    '  esc to cancel',
  ].join('\n')

  const inputBox = ['', '─────────────', '❯ ', '─────────────'].join('\n')

  it('is detected while it is the last thing on the pane', () => {
    const r = parsePermissionMenu(`${MENU}\n${inputBox}`)
    expect(r).not.toBeNull()
    expect(r!.options).toHaveLength(6)
  })

  it('is NOT detected once the agent has answered below it', () => {
    // `●` is Claude Code's own assistant marker — the conversation moved on.
    const after = '\n● Done — I sent Felipe the how-to.\n' + inputBox
    expect(parsePermissionMenu(MENU + after)).toBeNull()
  })

  it('is NOT detected once a tool result appears below it', () => {
    expect(parsePermissionMenu(`${MENU}\n  ⎿  8 skills available\n${inputBox}`)).toBeNull()
  })

  it('is NOT detected once a later prompt was submitted below it', () => {
    // A submitted prompt echoes as `❯ <text>`; an EMPTY `❯` is just the input box.
    expect(parsePermissionMenu(`${MENU}\n❯ ping from the chat\n${inputBox}`)).toBeNull()
  })

  it('is NOT detected once a status line appears below it', () => {
    expect(parsePermissionMenu(`${MENU}\n✻ Churned for 4s · done 11:16 AM\n${inputBox}`)).toBeNull()
  })

  it('survives the empty input box below it — that is not conversation', () => {
    expect(parsePermissionMenu(`${MENU}\n${inputBox}`)).not.toBeNull()
  })

  it('rejects the real 200-line scrollback that caused the report', () => {
    // Menu near the top, a long conversation after it, input box at the bottom.
    const filler = Array.from({ length: 40 }, (_, i) => `● turn ${i}`).join('\n')
    expect(parsePermissionMenu(`${MENU}\n${filler}\n${inputBox}`)).toBeNull()
  })
})
