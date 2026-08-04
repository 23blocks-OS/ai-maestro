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
})
