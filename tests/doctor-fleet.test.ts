/** Fleet findings the Doctor page derives from every host's report (docs/SPEC-DOCTOR.md section 5). */
import { describe, it, expect } from 'vitest'
import { compareVersions, fleetChecks, groupChecks, peerChecksToShow } from '@/lib/doctor-fleet'

const report = (version: string, extra = {}) => ({ schema: 2, version, checks: [], ...extra }) as any

describe('compareVersions', () => {
  it('compares numerically, not as text', () => {
    expect(compareVersions('0.106.9', '0.106.63')).toBe(-1)
    expect(compareVersions('0.106.63', '0.106.63')).toBe(0)
    expect(compareVersions('1.0', '0.999.999')).toBe(1)
  })
})

describe('fleetChecks', () => {
  it('flags an unreachable host, a host behind the newest, and a v1 host', () => {
    const out = fleetChecks([
      { hostId: 'a', report: report('0.106.63') },
      { hostId: 'b', report: report('0.106.9') },
      { hostId: 'c', report: { version: '0.106.63', checks: [] } as any },
      { hostId: 'd', error: 'timeout' },
    ])
    expect(out.a).toEqual([])
    expect(out.b.map(c => [c.name, c.status])).toEqual([['fleet:version', 'warn']])
    expect(out.c.map(c => [c.name, c.status])).toEqual([['fleet:schema', 'warn']])
    expect(out.d.map(c => [c.name, c.status])).toEqual([['fleet:reachable', 'fail']])
  })

  it('ignores a version it cannot read', () => {
    const out = fleetChecks([{ hostId: 'a', report: report('unknown') }, { hostId: 'b', report: report('0.106.63') }])
    expect(out.a).toEqual([])
  })
})

describe('groupChecks', () => {
  const checks = [
    { name: 'tmux', status: 'pass', message: '' },
    { name: 'ghost-agents', status: 'pass', category: 'agents', message: '' },
    { name: 'agent-folders', status: 'warn', category: 'agents', message: '' },
    { name: 'host:Mac Mini', status: 'fail', message: '' },
  ] as any[]

  it('orders categories and puts failures first', () => {
    const g = groupChecks(checks, new Set(['host:Mac Mini']))
    expect(g.map(x => x.category)).toEqual(['agents', 'host', 'peers'])
    expect(g[0].checks.map(c => c.name)).toEqual(['agent-folders', 'ghost-agents'])
  })

  it('drops peer checks not listed', () => {
    expect(groupChecks(checks, new Set()).map(x => x.category)).toEqual(['agents', 'host'])
  })
})

describe('peerChecksToShow', () => {
  const peer = (name: string) => ({ name: `host:${name}`, status: 'pass', message: '' }) as any
  it('shows a peer once, and never one that has its own card', () => {
    const out = peerChecksToShow([
      { hostId: 'mbp', name: 'MacBook Pro', checks: [peer('Mac Mini')] },
      { hostId: 'mini', name: 'Mac Mini', checks: [peer('MacBook Pro'), peer('Leonidas')] },
      { hostId: 'lola', name: 'Mini Lola', checks: [peer('Leonidas'), peer('Mac Mini')] },
    ])
    expect([...out.mbp]).toEqual([])
    expect([...out.mini]).toEqual(['host:Leonidas'])
    expect([...out.lola]).toEqual([])
  })
})
