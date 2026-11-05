/** B003: a number in a question menu only moves the selection; the click must also confirm it, once. */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { needsEnterAfterKey } from '@/lib/pane-permission.mjs'

const question = (selected: number) => [
  '❯ which should I use?',
  '',
  ' ☐ Database',
  '',
  'Which database should the service use?',
  '',
  ...['Postgres', 'SQLite', 'MySQL', 'Type something.'].map((l, i) => `${i + 1 === selected ? '❯' : ' '} ${i + 1}. ${l}`),
  '',
  'Enter to select · ↑/↓ to navigate · Esc to cancel',
].join('\n')

describe('needsEnterAfterKey', () => {
  it('a question menu with the clicked option selected needs Enter', () => {
    expect(needsEnterAfterKey(question(4), '4')).toBe(true)
  })

  it('no Enter when another option is selected (the key did not land), or the menu is gone', () => {
    expect(needsEnterAfterKey(question(1), '4')).toBe(false)
    expect(needsEnterAfterKey('⏺ Using Postgres.\n❯ \n', '1')).toBe(false)
  })

  it('no Enter for a permission menu: its number confirms (real Claude Code 2.1.306 capture)', () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/claude-hooks/pane-observed-permission.json'), 'utf8'))
    expect(fixture.dialog).toContain('❯ 1. Yes')
    expect(needsEnterAfterKey(fixture.dialog, '1')).toBe(false)
  })

  it('ignores anything that is not a single menu key', () => {
    expect(needsEnterAfterKey(question(4), '44')).toBe(false)
    expect(needsEnterAfterKey('', '4')).toBe(false)
  })
})
