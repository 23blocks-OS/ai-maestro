import { describe, it, expect } from 'vitest'
import { parseManagerPatch, managerChain, wouldLoop, reportsOf, suggestManager } from '@/lib/agent-manager'

const A = '8d92cd08-c3c9-4374-b9cd-713fe1cdbe3f'
const B = '4b00f39a-5a1f-48f6-a10a-e4cad95fbfa8'
const C = '381ae487-0000-4000-8000-000000000001'

describe('parseManagerPatch', () => {
  it('leaves an agent alone when the update does not touch the manager, even one with no manager', () => {
    const r = parseManagerPatch({}, {}, A)
    expect(r).toEqual({ ok: true, value: {}, changed: false })
  })
  it('accepts a person, an agent, or both, trimmed and lower-cased', () => {
    expect(parseManagerPatch({}, { humanManager: '  Juan Pelaez ' }, A)).toMatchObject({ ok: true, value: { humanManager: 'Juan Pelaez' }, changed: true })
    expect(parseManagerPatch({}, { managerAgentId: B.toUpperCase() }, A)).toMatchObject({ ok: true, value: { managerAgentId: B } })
    expect(parseManagerPatch({}, { humanManager: 'juan', managerAgentId: B }, A)).toMatchObject({ ok: true, value: { humanManager: 'juan', managerAgentId: B } })
  })
  it('clears one field with null or an empty string while the other stays', () => {
    const cur = { humanManager: 'juan', managerAgentId: B }
    expect(parseManagerPatch(cur, { managerAgentId: null }, A)).toMatchObject({ ok: true, value: { humanManager: 'juan', managerAgentId: undefined }, changed: true })
    expect(parseManagerPatch(cur, { humanManager: '' }, A)).toMatchObject({ ok: true, value: { humanManager: undefined, managerAgentId: B } })
  })
  it('refuses to leave an agent with no manager at all', () => {
    const r = parseManagerPatch({ humanManager: 'juan' }, { humanManager: null }, A)
    expect(r.ok).toBe(false)
    expect(parseManagerPatch({}, { managerAgentId: null }, A).ok).toBe(false)
  })
  it('refuses itself, a non-id, and an unusable name', () => {
    expect(parseManagerPatch({}, { managerAgentId: A }, A).ok).toBe(false)
    expect(parseManagerPatch({}, { managerAgentId: 'pas-lola' }, A).ok).toBe(false)
    expect(parseManagerPatch({}, { humanManager: 'x'.repeat(101) }, A).ok).toBe(false)
    expect(parseManagerPatch({}, { humanManager: 'a\nb' }, A).ok).toBe(false)
  })
  it('reports no change when the value is the same', () => {
    expect(parseManagerPatch({ humanManager: 'juan' }, { humanManager: 'juan' }, A)).toMatchObject({ ok: true, changed: false })
  })
})

describe('chains and loops', () => {
  const up: Record<string, string> = { [A]: B, [B]: C }
  const managerOf = (id: string) => up[id]
  it('follows the managers upward, nearest first', () => {
    expect(managerChain(A, managerOf)).toEqual({ chain: [B, C], loop: false })
  })
  it('stops at a loop', () => {
    expect(managerChain(A, id => ({ [A]: B, [B]: A } as Record<string, string>)[id])).toEqual({ chain: [B], loop: true })
  })
  it('sees that making your own boss your report closes a loop', () => {
    expect(wouldLoop(C, A, managerOf)).toBe(true)  // C is above A already
    expect(wouldLoop(A, C, managerOf)).toBe(false) // A under C is what the chain already says
    expect(wouldLoop(A, A, managerOf)).toBe(true)
  })
  it('lists who reports to someone', () => {
    const agents = [{ id: A, managerAgentId: B }, { id: C, managerAgentId: B }, { id: B }]
    expect(reportsOf(B, agents).map(a => a.id)).toEqual([A, C])
  })
})

describe('suggestManager', () => {
  const agents = [{ id: A, name: 'crab-gm' }, { id: B, name: 'pas-lola', label: 'Lola' }, { id: C, name: 'x' }]
  it('suggests the agent an owner names, by name or label, ignoring case', () => {
    expect(suggestManager({ id: C, owner: 'PAS-lola' }, agents)).toEqual({ managerAgentId: B, from: 'owner' })
    expect(suggestManager({ id: C, owner: 'lola' }, agents)).toEqual({ managerAgentId: B, from: 'owner' })
  })
  it('suggests a person for an owner that is no agent', () => {
    expect(suggestManager({ id: C, owner: 'juanpelaez' }, agents)).toEqual({ humanManager: 'juanpelaez', from: 'owner' })
  })
  it('suggests nothing when the agent has a manager, no owner, or a system owner; never itself', () => {
    expect(suggestManager({ id: C, owner: 'juan', humanManager: 'juan' }, agents)).toBeNull()
    expect(suggestManager({ id: C }, agents)).toBeNull()
    expect(suggestManager({ id: C, owner: 'system' }, agents)).toBeNull()
    expect(suggestManager({ id: A, name: 'crab-gm', owner: 'crab-gm' }, agents)).toBeNull()
  })
})
