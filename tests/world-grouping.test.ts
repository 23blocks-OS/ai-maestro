/**
 * World view grouping (lib/world/grouping.ts): the same fleet cut by host, by
 * org, or by org then host. The world is a map, so unlike the Org page (which
 * lists an agent under every org it tags) this must be a partition: every
 * agent in exactly one group, group counts summing to the fleet.
 */

import { describe, it, expect } from 'vitest'
import { getAgentOrg, groupAgents, isHostOffline, UNASSIGNED_ORG, type WorldAgentInput } from '@/lib/world/grouping'
import type { AgentPresence } from '@/lib/agent-presence'
import type { Host } from '@/types/host'

const agent = (id: string, hostId: string, tags?: string[]): WorldAgentInput =>
  ({ id, name: id, hostId, hostName: hostId, tags })

// 23blocks spans two hosts; mac-mini also carries a 3Metas agent and an untagged one
const AGENTS: WorldAgentInput[] = [
  agent('a1', 'mac-mini', ['org:23blocks']),
  agent('a2', 'mac-mini', ['org:23blocks', 'backend']),
  agent('a3', 'boulder-lab', ['org:23blocks']),
  agent('a4', 'mac-mini', ['org:3metas']),
  agent('a5', 'cloud-1', ['org:3metas']),
  agent('a6', 'mac-mini'),
  agent('a7', 'dead-host', ['org:23blocks']),
]

const HOSTS: Pick<Host, 'id' | 'name' | 'enabled'>[] = [
  { id: 'mac-mini', name: 'Mac Mini', enabled: true },
  { id: 'boulder-lab', name: 'Boulder Lab', enabled: true },
  { id: 'cloud-1', name: 'Cloud 1', enabled: true },
  { id: 'dead-host', name: 'Dead Host', enabled: false },
]

const PRESENCE: Record<string, AgentPresence> = {
  a1: 'working', a2: 'needs-you', a3: 'ready', a4: 'working',
  a5: 'offline', a6: 'needs-you', a7: 'offline',
}
const presenceOf = (a: WorldAgentInput) => PRESENCE[a.id]

function expectPartition(agents: WorldAgentInput[], mode: 'host' | 'org' | 'org-host') {
  const groups = groupAgents(agents, mode, { hosts: HOSTS, presenceOf })
  const ids = groups.flatMap(g => g.agents.map(a => a.id))
  expect(new Set(ids).size).toBe(ids.length) // no agent twice
  expect(ids.sort()).toEqual(agents.map(a => a.id).sort()) // none lost
  expect(groups.reduce((n, g) => n + g.counts.total, 0)).toBe(agents.length) // counts sum
  return groups
}

describe('getAgentOrg', () => {
  it('reads the first org: tag, lowercased like the Org page', () => {
    expect(getAgentOrg({ tags: ['backend', 'org:23Blocks'] })).toBe('23blocks')
    expect(getAgentOrg({ tags: ['org:23blocks', 'org:3metas'] })).toBe('23blocks')
  })
  it('falls back to the default org (personal), never to another company', () => {
    expect(getAgentOrg({ tags: ['backend'] })).toBe(UNASSIGNED_ORG)
    expect(getAgentOrg({})).toBe(UNASSIGNED_ORG)
  })
})

describe('isHostOffline', () => {
  it('is the repo rule: disabled means offline', () => {
    expect(isHostOffline({ enabled: false })).toBe(true)
    expect(isHostOffline({ enabled: true })).toBe(false)
    expect(isHostOffline({})).toBe(false)
    expect(isHostOffline(undefined)).toBe(false)
  })
})

describe('groupAgents', () => {
  it('partitions in all three modes', () => {
    expectPartition(AGENTS, 'host')
    expectPartition(AGENTS, 'org')
    expectPartition(AGENTS, 'org-host')
  })

  it('host mode: one group per host, labelled by the host record', () => {
    const groups = groupAgents(AGENTS, 'host', { hosts: HOSTS, presenceOf })
    expect(groups.map(g => g.key)).toEqual(['boulder-lab', 'cloud-1', 'dead-host', 'mac-mini'])
    const mini = groups.find(g => g.key === 'mac-mini')!
    expect(mini.label).toBe('Mac Mini')
    expect(mini.agents.map(a => a.id)).toEqual(['a1', 'a2', 'a4', 'a6'])
    expect(mini.counts).toEqual({ total: 4, working: 2, needsYou: 2, ready: 0, offline: 0 })
  })

  it('org mode: pooled across hosts, untagged agents in their own group', () => {
    const groups = groupAgents(AGENTS, 'org', { hosts: HOSTS, presenceOf })
    const blocks = groups.find(g => g.key === '23blocks')!
    expect(blocks.agents.map(a => a.id)).toEqual(['a1', 'a2', 'a3', 'a7'])
    expect(blocks.hostIds).toEqual(['boulder-lab', 'dead-host', 'mac-mini'])
    expect(groups.find(g => g.key === UNASSIGNED_ORG)!.agents.map(a => a.id)).toEqual(['a6'])
  })

  it('org-host mode: one group per (org, host) pair — 23blocks split by its hosts', () => {
    const groups = groupAgents(AGENTS, 'org-host', { hosts: HOSTS, presenceOf })
    const pair = groups.find(g => g.key === '23blocks|mac-mini')!
    expect(pair.label).toBe('23blocks · Mac Mini')
    expect(pair.orgId).toBe('23blocks')
    expect(pair.hostId).toBe('mac-mini')
    expect(pair.agents.map(a => a.id)).toEqual(['a1', 'a2'])
    expect(groups.find(g => g.key === '23blocks|boulder-lab')!.agents.map(a => a.id)).toEqual(['a3'])
    // The same host under another org is a different island
    expect(groups.find(g => g.key === '3metas|mac-mini')!.agents.map(a => a.id)).toEqual(['a4'])
  })

  it('propagates host-offline: full in host/org-host modes, partial in org mode', () => {
    const byHost = groupAgents(AGENTS, 'host', { hosts: HOSTS, presenceOf })
    expect(byHost.find(g => g.key === 'dead-host')!.offline).toBe(true)
    expect(byHost.find(g => g.key === 'mac-mini')!.offline).toBe(false)

    const byOrgHost = groupAgents(AGENTS, 'org-host', { hosts: HOSTS, presenceOf })
    expect(byOrgHost.find(g => g.key === '23blocks|dead-host')!.offline).toBe(true)

    const byOrg = groupAgents(AGENTS, 'org', { hosts: HOSTS, presenceOf })
    const blocks = byOrg.find(g => g.key === '23blocks')!
    expect(blocks.offlineHostIds).toEqual(['dead-host']) // one of its hosts is down…
    expect(blocks.offline).toBe(false) // …but the org is not wholly offline
    expect(byOrg.find(g => g.key === '3metas')!.offlineHostIds).toEqual([])
  })

  it('counts presence with the shared derivation, and totals without one', () => {
    const withPresence = groupAgents(AGENTS, 'org', { hosts: HOSTS, presenceOf })
    expect(withPresence.find(g => g.key === '3metas')!.counts)
      .toEqual({ total: 2, working: 1, needsYou: 0, ready: 0, offline: 1 })
    const bare = groupAgents(AGENTS, 'org', { hosts: HOSTS })
    expect(bare.reduce((n, g) => n + g.counts.total, 0)).toBe(AGENTS.length)
    expect(bare.every(g => g.counts.working === 0)).toBe(true)
  })

  it('uses org record names for labels when given one', () => {
    const groups = groupAgents(AGENTS, 'org', { hosts: HOSTS, orgNames: { '23blocks': '23blocks Inc' } })
    expect(groups.find(g => g.key === '23blocks')!.label).toBe('23blocks Inc')
  })

  it('is deterministic: same input, same order', () => {
    const a = groupAgents(AGENTS, 'org-host', { hosts: HOSTS })
    const b = groupAgents([...AGENTS].reverse(), 'org-host', { hosts: HOSTS })
    expect(a.map(g => g.key)).toEqual(b.map(g => g.key))
    expect(a.map(g => g.agents.map(x => x.id))).toEqual(b.map(g => g.agents.map(x => x.id)))
  })

  it('keeps the first sighting of a duplicated agent id', () => {
    const dup = [...AGENTS, agent('a1', 'cloud-1', ['org:3metas'])]
    const groups = groupAgents(dup, 'host', { hosts: HOSTS })
    expect(groups.reduce((n, g) => n + g.counts.total, 0)).toBe(AGENTS.length)
    expect(groups.find(g => g.key === 'mac-mini')!.agents.some(a => a.id === 'a1')).toBe(true)
  })
})

describe('sandbox agents', () => {
  it('are recognised by org:sandbox only', async () => {
    const { isSandboxAgent } = await import('@/lib/world/grouping')
    expect(isSandboxAgent({ tags: ['org:sandbox'] })).toBe(true)
    expect(isSandboxAgent({ tags: ['sandbox', 'org:23blocks'] })).toBe(false)
    expect(isSandboxAgent({})).toBe(false)
  })
})

describe('buildings', () => {
  it('an org island has a building per host its agents run on, and every agent is in exactly one', () => {
    const org = groupAgents(AGENTS, 'org', { hosts: HOSTS, presenceOf }).find(g => g.key === '23blocks')!
    expect(org.buildings.map(b => [b.key, b.label, b.agents.length])).toEqual([
      ['mac-mini', 'Mac Mini', 2], ['boulder-lab', 'Boulder Lab', 1], ['dead-host', 'Dead Host', 1],
    ])
    expect(org.buildings.flatMap(b => b.agents.map(a => a.id)).sort()).toEqual(org.agents.map(a => a.id).sort())
    expect(org.buildings.reduce((n, b) => n + b.counts.total, 0)).toBe(org.counts.total)
  })

  it('a host island has a building per organization running on it', () => {
    const host = groupAgents(AGENTS, 'host', { hosts: HOSTS, presenceOf }).find(g => g.key === 'mac-mini')!
    expect(host.buildings.map(b => [b.key, b.agents.length]).sort()).toEqual([['23blocks', 2], ['3metas', 1], ['personal', 1]])
    expect(host.buildings.find(b => b.key === 'personal')!.label).toBe('Personal')
  })

  it('counts each building by status, and marks a building offline when its host is', () => {
    const org = groupAgents(AGENTS, 'org', { hosts: HOSTS, presenceOf }).find(g => g.key === '23blocks')!
    const mini = org.buildings.find(b => b.key === 'mac-mini')!
    expect([mini.counts.working, mini.counts.needsYou]).toEqual([1, 1])
    expect(mini.offline).toBe(false)
    expect(org.buildings.find(b => b.key === 'dead-host')!.offline).toBe(true)
  })

  it('is the same for every mode in what matters: no agent lost or doubled', () => {
    for (const mode of ['host', 'org', 'org-host'] as const) {
      for (const g of groupAgents(AGENTS, mode, { hosts: HOSTS, presenceOf })) {
        expect(g.buildings.flatMap(b => b.agents.map(a => a.id)).sort()).toEqual(g.agents.map(a => a.id).sort())
        expect(g.buildings.length).toBeGreaterThan(0)
      }
    }
  })
})
