import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/team-registry', () => ({ loadTeams: () => [{ id: 'T1', name: 'Core Team', agentIds: ['id-dev'] }] }))
vi.mock('@/lib/agent-registry', () => ({
  getAgent: (id: string) => (id === 'id-dev' ? { id: 'id-dev', name: 'dev' } : null),
  getAgentByName: () => null,
  getAgentByNameAnyHost: () => null,
}))
vi.mock('@/lib/hosts-config', () => ({ getSelfHostId: () => 'acme-1', isSelf: (h: string) => h === 'acme-1' }))

import { teamsOf } from '@/lib/policy-check'

describe('teamsOf', () => {
  it('finds a local member by id or by name', () => {
    expect(teamsOf({ kind: 'agent', id: 'id-dev', name: 'dev', host: 'acme-1' })).toEqual(['t1', 'core team'])
    expect(teamsOf({ kind: 'agent', name: 'dev', host: 'acme-1' })).toEqual(['t1', 'core team'])
  })

  it('does not count a same-named agent on another host', () => {
    expect(teamsOf({ kind: 'agent', id: 'other-id', name: 'dev', host: 'acme-2' })).toEqual([])
  })
})
