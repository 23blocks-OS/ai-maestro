import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/agent-registry', () => ({ loadAgents: () => [] }))
vi.mock('@/lib/hosts-config', () => ({ isSelf: () => true }))
vi.mock('@/lib/agent-runtime', () => ({ getRuntime: () => ({}) }))
vi.mock('@/services/sessions-service', () => ({ lastHookReport: () => null }))
vi.mock('@/lib/wake-queue', () => ({ pendingWakeCount: () => 0 }))
vi.mock('@/lib/streaming-bridge.mjs', () => ({ hasStreamSession: () => false }))
vi.mock('@/lib/session-idle', () => ({ msSinceActivity: () => null }))

import { hibernateIdleAgents, type IdleDeps } from '@/services/idle-hibernate-service'

const H = 3_600_000
const NOW = 100 * H
const agent = (over: Record<string, unknown> = {}) => ({ id: 'a1', name: 'alpha', program: 'claude', workingDirectory: '/w', preferences: { hibernateAfterIdleHours: 4 }, ...over }) as any

function deps(over: Partial<IdleDeps> = {}): IdleDeps & { hibernate: ReturnType<typeof vi.fn> } {
  return {
    report: () => ({ status: 'waiting_for_input', notificationType: 'idle_prompt', at: NOW - 5 * H }),
    sessionExists: async () => true,
    sinceOutput: () => null,
    busy: () => false,
    hibernate: vi.fn(async () => true),
    now: () => NOW,
    ...over,
  } as any
}

describe('idle hibernate (F073)', () => {
  it('hibernates an opted-in agent idle longer than its limit', async () => {
    const d = deps()
    expect(await hibernateIdleAgents(d, [agent()])).toEqual(['alpha'])
    expect(d.hibernate).toHaveBeenCalledWith('a1')
  })

  it('leaves it alone when not opted in, not idle long enough, or no terminal', async () => {
    for (const [a, d] of [
      [agent({ preferences: {} }), deps()],
      [agent(), deps({ report: () => ({ status: 'idle', at: NOW - 3 * H }) })],
      [agent(), deps({ sessionExists: async () => false })],
      [agent({ program: 'codex' }), deps()],
      [agent({ deletedAt: 'x' }), deps()],
    ] as const) {
      expect(await hibernateIdleAgents(d, [a])).toEqual([])
      expect(d.hibernate).not.toHaveBeenCalled()
    }
  })

  it('never while working, asking, printing, or busy', async () => {
    for (const d of [
      deps({ report: () => ({ status: 'active', at: NOW - 9 * H }) }),
      deps({ report: () => ({ status: 'waiting_for_input', notificationType: 'permission_prompt', at: NOW - 9 * H }) }),
      deps({ report: () => null }),
      deps({ sinceOutput: () => H }),
      deps({ busy: () => true }),
    ]) {
      expect(await hibernateIdleAgents(d, [agent()])).toEqual([])
      expect(d.hibernate).not.toHaveBeenCalled()
    }
  })
})
