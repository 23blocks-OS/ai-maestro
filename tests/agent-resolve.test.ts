import { describe, it, expect } from 'vitest'
import { resolveAgentRef, suggestAgents } from '@/lib/agent-resolve'
import type { Agent } from '@/types/agent'

// Field report (2026-10-25): an agent could not message "Titania". Titania is the label of the agent named
// 23blocks-iac, and only the name was addressable.
const a = (o: Partial<Agent>) => ({ tags: [], ...o }) as Agent
const iac = a({ id: 'id-iac', name: '23blocks-iac', label: 'Titania', alias: 'IaC', hostId: 'mbp' })
const cto = a({ id: 'id-cto', name: '23b-cto', label: 'Zain', hostId: 'mbp' })
const fleet = [iac, cto]

describe('resolveAgentRef', () => {
  it('resolves the label the dashboard shows', () => {
    const r = resolveAgentRef('Titania', fleet)
    expect(r).toMatchObject({ status: 'found', via: 'label', agent: { name: '23blocks-iac' } })
  })
  it('resolves the alias, case-insensitively', () => {
    expect(resolveAgentRef('iac', fleet)).toMatchObject({ status: 'found', via: 'alias', agent: { id: 'id-iac' } })
  })
  it('prefers an exact name over a label that says the same', () => {
    const imposter = a({ id: 'id-x', name: 'other', label: '23b-cto' })
    expect(resolveAgentRef('23b-cto', [imposter, cto])).toMatchObject({ status: 'found', via: 'name', agent: { id: 'id-cto' } })
  })
  it('resolves an id', () => {
    expect(resolveAgentRef('id-cto', fleet)).toMatchObject({ status: 'found', via: 'id' })
  })
  it('never picks between two agents with the same label', () => {
    const twin = a({ id: 'id-t2', name: 'iac-2', label: 'titania', hostId: 'mini' })
    const r = resolveAgentRef('Titania', [iac, twin])
    expect(r.status).toBe('ambiguous')
    if (r.status === 'ambiguous') expect(r.candidates.map(c => c.id).sort()).toEqual(['id-iac', 'id-t2'])
  })
  it('ignores soft-deleted agents', () => {
    expect(resolveAgentRef('Titania', [{ ...iac, deletedAt: '2026-01-01' }, cto]).status).toBe('none')
  })
  it('offers close matches when nothing resolves', () => {
    const r = resolveAgentRef('iac-agent', fleet)
    expect(r.status).toBe('none')
    if (r.status === 'none') expect(r.suggestions.map(s => s.name)).toContain('23blocks-iac')
  })
  it('does not resolve or suggest on an empty reference', () => {
    expect(resolveAgentRef('  ', fleet)).toEqual({ status: 'none', suggestions: [] })
    expect(suggestAgents('', fleet)).toEqual([])
  })
})
