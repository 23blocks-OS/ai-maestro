import { describe, it, expect } from 'vitest'
import {
  isValidDue, parseDueInput, parseOwnersInput, isCoOwner, dueState, dueLabel, localToday, compareDue, sortByDue, MAX_OWNERS,
} from '@/lib/task-due'

describe('isValidDue: a real calendar date, YYYY-MM-DD', () => {
  it('accepts real dates, including a leap day', () => {
    expect(isValidDue('2026-10-25')).toBe(true)
    expect(isValidDue('2028-02-29')).toBe(true)
    expect(isValidDue('2026-12-31')).toBe(true)
  })
  it('refuses dates that do not exist', () => {
    expect(isValidDue('2026-02-30')).toBe(false)
    expect(isValidDue('2026-02-29')).toBe(false) // 2026 is not a leap year
    expect(isValidDue('2100-02-29')).toBe(false) // 2100 is not a leap year either
    expect(isValidDue('2026-04-31')).toBe(false)
    expect(isValidDue('2026-13-01')).toBe(false)
    expect(isValidDue('2026-00-10')).toBe(false)
    expect(isValidDue('2026-10-00')).toBe(false)
  })
  it('refuses anything that is not exactly a date: no time, no timezone, no other shape', () => {
    for (const bad of ['2026-10-25T10:00:00Z', '2026-10-25 10:00', '2026-1-5', '10/25/2026', 'tomorrow', '', ' 2026-10-25', 20261025, null, undefined, {}]) {
      expect(isValidDue(bad)).toBe(false)
    }
  })
})

describe('parseDueInput', () => {
  it('not given leaves it alone; null or empty clears; a date is kept', () => {
    expect(parseDueInput(undefined)).toEqual({ ok: true, value: undefined })
    expect(parseDueInput(null)).toEqual({ ok: true, value: null })
    expect(parseDueInput('')).toEqual({ ok: true, value: null })
    expect(parseDueInput('2026-10-25')).toEqual({ ok: true, value: '2026-10-25' })
  })
  it('refuses a bad date with a message that names the format', () => {
    const r = parseDueInput('2026-02-30')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.message).toContain('YYYY-MM-DD')
  })
})

describe('parseOwnersInput', () => {
  it('not given leaves it alone; null and [] clear', () => {
    expect(parseOwnersInput(undefined)).toEqual({ ok: true, value: undefined })
    expect(parseOwnersInput(null)).toEqual({ ok: true, value: null })
    expect(parseOwnersInput([])).toEqual({ ok: true, value: null })
  })
  it('keeps ids and names as given, trimmed, in order', () => {
    expect(parseOwnersInput([' a2 ', 'Gamma', 'crab-cto@mini'])).toEqual({ ok: true, value: ['a2', 'Gamma', 'crab-cto@mini'] })
  })
  it('removes duplicates (names without case) and the primary assignee', () => {
    expect(parseOwnersInput(['a2', 'A2', 'gamma', 'Gamma', 'a1'], ['a1'])).toEqual({ ok: true, value: ['a2', 'gamma'] })
    // only the primary listed: nothing left, which clears
    expect(parseOwnersInput(['a1'], ['a1'])).toEqual({ ok: true, value: null })
    // several primaries (the board's owner and the assignee), some empty
    expect(parseOwnersInput(['a1', 'a3', 'a4'], ['a1', null, undefined, 'a3'])).toEqual({ ok: true, value: ['a4'] })
  })
  it('allows ten and refuses eleven', () => {
    const ten = Array.from({ length: MAX_OWNERS }, (_, i) => `agent${i}`)
    expect(parseOwnersInput(ten)).toEqual({ ok: true, value: ten })
    expect(parseOwnersInput([...ten, 'agent10']).ok).toBe(false)
    // the limit counts after duplicates and the primary are taken out
    expect(parseOwnersInput([...ten, 'agent0', 'a1'], ['a1'])).toEqual({ ok: true, value: ten })
  })
  it('refuses what is not a list of agent ids or names', () => {
    expect(parseOwnersInput('a2').ok).toBe(false)
    expect(parseOwnersInput({ a: 1 }).ok).toBe(false)
    expect(parseOwnersInput([1]).ok).toBe(false)
    expect(parseOwnersInput(['../etc']).ok).toBe(false)
    expect(parseOwnersInput(['has space']).ok).toBe(false)
    expect(parseOwnersInput(['']).ok).toBe(false)
    expect(parseOwnersInput(['x'.repeat(101)]).ok).toBe(false)
  })
})

describe('isCoOwner', () => {
  it('matches an id or any of the names, without case', () => {
    expect(isCoOwner(['a2', 'Gamma'], 'a9', 'gamma')).toBe(true)
    expect(isCoOwner(['A2'], 'a2')).toBe(true)
    expect(isCoOwner(['a2'], 'a9', undefined, null)).toBe(false)
    expect(isCoOwner(undefined, 'a2')).toBe(false)
    expect(isCoOwner([], 'a2')).toBe(false)
  })
})

describe('dueState and dueLabel (today is the reader\'s local date)', () => {
  const today = '2026-10-21'
  it('overdue before today, today, soon within three days, later after that', () => {
    expect(dueState('2026-10-19', today)).toEqual({ kind: 'overdue', days: -2 })
    expect(dueState('2026-10-20', today).kind).toBe('overdue')
    expect(dueState('2026-10-21', today)).toEqual({ kind: 'today', days: 0 })
    expect(dueState('2026-10-22', today)).toEqual({ kind: 'soon', days: 1 })
    expect(dueState('2026-10-24', today)).toEqual({ kind: 'soon', days: 3 })
    expect(dueState('2026-10-25', today)).toEqual({ kind: 'later', days: 4 })
  })
  it('counts days across a month and a year end', () => {
    expect(dueState('2026-11-01', '2026-10-31')).toEqual({ kind: 'soon', days: 1 })
    expect(dueState('2027-01-02', '2026-12-31')).toEqual({ kind: 'soon', days: 2 })
    expect(dueState('2026-12-30', '2027-01-02')).toEqual({ kind: 'overdue', days: -3 })
    expect(dueState('2028-03-01', '2028-02-28')).toEqual({ kind: 'soon', days: 2 }) // over a leap day
  })
  it('labels: due Oct 25, due today, overdue 2d', () => {
    expect(dueLabel('2026-10-25', today)).toBe('due Oct 25')
    expect(dueLabel('2026-10-22', today)).toBe('due Oct 22')
    expect(dueLabel('2026-10-21', today)).toBe('due today')
    expect(dueLabel('2026-10-19', today)).toBe('overdue 2d')
    expect(dueLabel('2026-10-20', today)).toBe('overdue 1d')
  })
  it('localToday is the local calendar date, zero padded', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(localToday(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })
})

describe('sorting by due date', () => {
  it('dated first by earliest due; undated after, each group keeping its order', () => {
    const cards = [
      { id: 'u1' }, { id: 'late', due: '2026-11-01' }, { id: 'u2', due: null }, { id: 'soon', due: '2026-10-22' }, { id: 'same1', due: '2026-10-30' }, { id: 'same2', due: '2026-10-30' }, { id: 'u3' },
    ]
    expect(sortByDue(cards).map(c => c.id)).toEqual(['soon', 'same1', 'same2', 'late', 'u1', 'u2', 'u3'])
  })
  it('does not change the list it is given', () => {
    const cards = [{ id: 'b', due: '2026-11-01' }, { id: 'a', due: '2026-10-01' }]
    sortByDue(cards)
    expect(cards.map(c => c.id)).toEqual(['b', 'a'])
  })
  it('compareDue puts a dated card before an undated one', () => {
    expect(compareDue('2026-10-01', undefined)).toBe(-1)
    expect(compareDue(undefined, '2026-10-01')).toBe(1)
    expect(compareDue(undefined, null)).toBe(0)
  })
})
