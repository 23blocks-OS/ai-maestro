/**
 * Tests for lib/agent-schedule.ts — agent-owned scheduled tasks.
 *
 * The schedule is the agent's data, stored beside its database and keys, so it
 * travels when the agent moves machines. These lock the scheduling rules that
 * make that work, and in particular the two decisions taken because the old
 * design failed at exactly those points:
 *
 *   - a never-run task is due IMMEDIATELY, so an agent that just arrived on a
 *     new host starts working instead of waiting out a full interval;
 *   - a daily task uses a 23-hour window rather than "today", so a machine
 *     asleep at 2am still consolidates when it wakes, instead of silently
 *     skipping the day — the failure mode of the old resident-at-2am-or-never
 *     design.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFs } = vi.hoisted(() => ({
  mockFs: {
    readFileSync: vi.fn((_p?: any): string => { throw new Error('ENOENT') }),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}))
vi.mock('fs', () => ({ default: mockFs, ...mockFs }))

import {
  defaultSchedule,
  readSchedule,
  writeSchedule,
  isDue,
  dueTasks,
  describeCadence,
  type ScheduledTask,
} from '@/lib/agent-schedule'

const HOUR = 3600_000
const task = (over: Partial<ScheduledTask> = {}): ScheduledTask => ({
  id: 't', action: 'index', everyMs: HOUR, enabled: true, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT') })
})

describe('defaults', () => {
  it('seeds indexing and consolidation for a new agent', () => {
    const s = defaultSchedule('a1')
    expect(s.tasks.map((t) => t.action).sort()).toEqual(['consolidate', 'index'])
    expect(s.tasks.every((t) => t.enabled)).toBe(true)
  })

  it('falls back to the default when no schedule file exists', () => {
    expect(readSchedule('a1').tasks.length).toBeGreaterThan(0)
  })

  it('falls back to the default when the file is corrupt', () => {
    // An unreadable schedule must not leave the agent with no maintenance.
    mockFs.readFileSync.mockReturnValue('not json{')
    expect(readSchedule('a1').tasks.length).toBeGreaterThan(0)
  })

  it('reads a stored schedule', () => {
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({ version: 1, agentId: 'a1', tasks: [task({ id: 'custom' })] })
    )
    expect(readSchedule('a1').tasks[0].id).toBe('custom')
  })

  it('writes beside the agent, so the schedule travels with it', () => {
    writeSchedule({ version: 1, agentId: 'a1', tasks: [task()] })
    const written = mockFs.writeFileSync.mock.calls[0][0] as string
    expect(written).toContain('.aimaestro/agents/a1/schedule.json')
  })
})

describe('isDue — interval tasks', () => {
  it('is due immediately when it has never run', () => {
    // An agent arriving on a new machine should start working, not idle out a
    // full interval first.
    expect(isDue(task())).toBe(true)
  })

  it('is not due before the interval elapses', () => {
    const now = Date.now()
    expect(isDue(task({ lastRunAt: now - HOUR / 2 }), now)).toBe(false)
  })

  it('is due once the interval elapses', () => {
    const now = Date.now()
    expect(isDue(task({ lastRunAt: now - HOUR - 1 }), now)).toBe(true)
  })

  it('is never due when disabled', () => {
    expect(isDue(task({ enabled: false }))).toBe(false)
  })
})

describe('isDue — daily tasks', () => {
  const at2am = (dayOffset = 0, hour = 2) => {
    const d = new Date()
    d.setDate(d.getDate() + dayOffset)
    d.setHours(hour, 5, 0, 0)
    return d.getTime()
  }

  it('is due at the configured hour when it has never run', () => {
    expect(isDue(task({ everyMs: undefined, atHour: 2 }), at2am())).toBe(true)
  })

  it('is not due outside the configured hour', () => {
    expect(isDue(task({ everyMs: undefined, atHour: 2 }), at2am(0, 14))).toBe(false)
  })

  it('does not run twice in the same window', () => {
    const now = at2am()
    expect(isDue(task({ everyMs: undefined, atHour: 2, lastRunAt: now - HOUR }), now)).toBe(false)
  })

  it('still runs after a day was missed', () => {
    // The old design required the agent to be resident AT 2am or it silently
    // skipped. A 23h window means a machine asleep then catches up.
    const now = at2am()
    expect(isDue(task({ everyMs: undefined, atHour: 2, lastRunAt: now - 48 * HOUR }), now)).toBe(true)
  })
})

describe('isDue — misconfiguration', () => {
  it('never fires a task with no cadence rather than throwing', () => {
    // This runs inside an agent's idle transition; a config mistake must not
    // break the hook that reported the status.
    expect(isDue(task({ everyMs: undefined, atHour: undefined }))).toBe(false)
  })
})

describe('dueTasks', () => {
  it('returns only the due ones, in declaration order', () => {
    const now = Date.now()
    const schedule = {
      version: 1 as const,
      agentId: 'a1',
      tasks: [
        task({ id: 'fresh', lastRunAt: now }),
        task({ id: 'stale', lastRunAt: now - 2 * HOUR }),
        task({ id: 'off', enabled: false }),
        task({ id: 'never' }),
      ],
    }
    expect(dueTasks(schedule, now).map((t) => t.id)).toEqual(['stale', 'never'])
  })
})

describe('describeCadence', () => {
  it('renders intervals and daily times', () => {
    expect(describeCadence(task({ everyMs: HOUR }))).toBe('every 1h')
    expect(describeCadence(task({ everyMs: 15 * 60000 }))).toBe('every 15m')
    expect(describeCadence(task({ everyMs: undefined, atHour: 2 }))).toBe('daily at 02:00')
    expect(describeCadence(task({ everyMs: undefined }))).toBe('unscheduled')
  })
})
