/** Where each member goes in the org chart */
import { describe, it, expect } from 'vitest'
import { buildChart } from '@/components/org/OrgChart'
import { buildOrganizations, type OrgAgentInput, type OrgPersonInput } from '@/lib/organization'

const agents: OrgAgentInput[] = [
  { id: 'a-lead', name: 'lead', hostId: 'h', tags: ['org:acme'], humanManager: 'p-ana' },
  { id: 'a-worker', name: 'worker', hostId: 'h', tags: ['org:acme'], humanManager: 'p-ana', managerAgentId: 'a-lead' },
  { id: 'a-orphan', name: 'orphan', hostId: 'h', tags: ['org:acme'], humanManager: 'Someone not in the directory' },
  { id: 'a-helper', name: 'helper', hostId: 'h', tags: ['org:acme'], humanManager: 'p-outside' },
  { id: 'a-sub', name: 'sub', hostId: 'h', tags: ['org:acme'], managerAgentId: 'a-orphan' },
]
const people: OrgPersonInput[] = [
  { id: 'p-boss', displayName: 'Boss', hostId: 'h', orgs: ['acme'] },
  { id: 'p-ana', displayName: 'Ana', hostId: 'h', orgs: ['acme'], managerPersonId: 'p-boss' },
  { id: 'p-outside', displayName: 'Outside', hostId: 'h', orgs: ['other'] },
]
const acme = buildOrganizations(agents, [], [], [], 'personal', people).find(o => o.id === 'acme')!
const keys = (list: Array<{ key: string }> | undefined) => (list || []).map(n => n.key)

describe('org chart', () => {
  const { children, unplaced, looped } = buildChart(acme)

  it('people over people, then agents under their person, and agents under their agent manager', () => {
    // Outside is in acme through the agent that reports to them (derived membership)
    expect(keys(children.get('root'))).toEqual(['p:p-boss', 'p:p-outside'])
    expect(keys(children.get('p:p-outside'))).toEqual(['a:a-helper'])
    expect(keys(children.get('p:p-boss'))).toEqual(['p:p-ana'])
    expect(keys(children.get('p:p-ana'))).toEqual(['a:a-lead'])
    expect(keys(children.get('a:a-lead'))).toEqual(['a:a-worker']) // the agent manager wins over the person
  })

  it('an agent whose manager is not in the directory is listed apart, with its own reports under it', () => {
    expect(keys(unplaced)).toEqual(['a:a-orphan'])
    expect(keys(children.get('a:a-orphan'))).toEqual(['a:a-sub'])
    expect(looped).toEqual([])
  })

  it('a loop of managers across hosts is shown, not lost', () => {
    const org = buildOrganizations([], [], [], [], 'personal', [
      { id: 'p-x', displayName: 'X', hostId: 'h1', orgs: ['acme'], managerPersonId: 'p-y' },
      { id: 'p-y', displayName: 'Y', hostId: 'h2', orgs: ['acme'], managerPersonId: 'p-x' },
    ]).find(o => o.id === 'acme')!
    const chart = buildChart(org)
    expect(keys(chart.children.get('root'))).toEqual([])
    expect(keys(chart.looped).sort()).toEqual(['p:p-x', 'p:p-y'])
  })
})
