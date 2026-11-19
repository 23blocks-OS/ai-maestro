/** B044: the origin guard decision, audit vs enforce, logging and counts (docs/SPEC-SECURITY-POSTURE.md part B) */
import { describe, it, expect } from 'vitest'
import { decide, createOriginGuard, guardMode, parseTrustedOrigins, buildKnownHostnames, hostnameOf } from '@/lib/origin-guard.mjs'
import { checkCrossOrigin } from '@/services/doctor-checks'

const ctx = {
  knownHostnames: buildKnownHostnames({
    hostname: 'host-a',
    selfAliases: ['host-a', '10.0.0.5', 'http://10.0.0.5:23000'],
    hosts: [{ id: 'host-b', url: 'http://100.64.0.2:23000', aliases: ['host-b.lan'] }],
  }),
  trustedOrigins: parseTrustedOrigins('https://maestro.acme.example, not a url'),
}
const H = 'localhost:23000'
const ws = (headers: Record<string, string>) => decide(headers, true, ctx)

describe('decide', () => {
  it('allows a client with no Origin and no Sec-Fetch-Site (curl, node ws, other hosts)', () => {
    expect(ws({ host: H }).ok).toBe(true)
    expect(ws({}).ok).toBe(true)
  })

  it('allows same-origin, http or https, and Sec-Fetch-Site same-origin or none', () => {
    expect(ws({ host: '10.0.0.5:23000', origin: 'http://10.0.0.5:23000' }).ok).toBe(true)
    expect(ws({ host: 'box.tail1.ts.net', origin: 'https://box.tail1.ts.net' }).ok).toBe(true)
    expect(ws({ host: H, origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' }).ok).toBe(true)
    expect(ws({ host: H, 'sec-fetch-site': 'none' }).ok).toBe(true)
  })

  it('allows loopback origins, IPv6 included', () => {
    expect(ws({ host: H, origin: 'http://localhost:3000' }).ok).toBe(true)
    expect(ws({ host: H, origin: 'http://127.0.0.1:23000' }).ok).toBe(true)
    expect(ws({ host: '[::1]:23000', origin: 'http://[::1]:23000' }).ok).toBe(true)
    expect(ws({ host: H, origin: 'http://[::1]:5173' }).ok).toBe(true)
  })

  it('allows the dashboard of a configured host (url, alias) and a trusted origin', () => {
    expect(ws({ host: '10.0.0.5:23000', origin: 'http://100.64.0.2:23000' }).ok).toBe(true)
    expect(ws({ host: '10.0.0.5:23000', origin: 'http://host-b.lan:23000' }).ok).toBe(true)
    expect(ws({ host: '10.0.0.5:23000', origin: 'https://maestro.acme.example' }).ok).toBe(true)
    expect(ws({ host: 'maestro.acme.example', origin: 'https://maestro.acme.example' }).ok).toBe(true)
  })

  it('refuses a foreign page, "null", and a cross-site request without Origin', () => {
    expect(ws({ host: H, origin: 'https://evil.example' })).toEqual({ ok: false, reason: 'foreign-origin', origin: 'https://evil.example', host: H })
    expect(ws({ host: H, origin: 'null' }).ok).toBe(false)
    expect(ws({ host: H, origin: 'http://10.0.0.99:23000' }).ok).toBe(false) // a LAN address that is not a known host
    expect(ws({ host: H, 'sec-fetch-site': 'cross-site' }).ok).toBe(false)
    expect(ws({ host: H, origin: 'http://maestro.acme.example' }).ok).toBe(false) // trusted is https only
  })

  it('refuses an unknown Host name (DNS rebinding), even same-origin and on GET', () => {
    expect(ws({ host: 'rebind.evil.example:23000', origin: 'http://rebind.evil.example:23000' }).reason).toBe('unknown-host')
    expect(decide({ host: 'rebind.evil.example:23000' }, false, ctx).reason).toBe('unknown-host')
    for (const host of ['host-a:23000', 'host-a.local:23000', 'host-b.lan', '192.168.1.9:23000', '[fe80::1]:23000', 'box.tail1.ts.net', 'app.localhost'])
      expect(decide({ host }, false, ctx).ok).toBe(true)
  })

  it('does not check Origin on safe methods', () => {
    expect(decide({ host: H, origin: 'https://evil.example' }, false, ctx).ok).toBe(true)
  })
})

describe('helpers', () => {
  it('guardMode defaults to audit', () => {
    expect(guardMode({})).toBe('audit')
    expect(guardMode({ AIMAESTRO_ORIGIN_GUARD: 'ENFORCE' })).toBe('enforce')
    expect(guardMode({ AIMAESTRO_ORIGIN_GUARD: 'off' })).toBe('off')
    expect(guardMode({ AIMAESTRO_ORIGIN_GUARD: 'bogus' })).toBe('audit')
  })
  it('hostnameOf', () => {
    expect(hostnameOf('[::1]:23000')).toBe('::1')
    expect(hostnameOf('::1')).toBe('::1')
    expect(hostnameOf('Host-A:23000')).toBe('host-a')
    expect(hostnameOf('http://10.0.0.5:23000')).toBe('10.0.0.5')
  })
})

describe('createOriginGuard', () => {
  const evilPost = { method: 'POST', url: '/api/sessions/x/command?y=1', headers: { host: H, origin: 'https://evil.example' } }

  function guard(mode: string) {
    const lines: string[] = []
    let t = 0
    const g = createOriginGuard({ mode, getContext: () => ctx, log: (m: string) => lines.push(m), now: () => t })
    return { g, lines, tick: (ms: number) => { t += ms } }
  }

  it('audit allows, logs once per hour per (path, origin), and counts', () => {
    const { g, lines, tick } = guard('audit')
    expect(g.check(evilPost)).toMatchObject({ allow: true, decision: { ok: false } })
    g.check(evilPost)
    expect(lines).toEqual(['[origin-guard] would refuse (audit) POST /api/sessions/x/command: foreign-origin, Origin https://evil.example, Host localhost:23000'])
    tick(60 * 60 * 1000)
    g.check(evilPost)
    expect(lines).toHaveLength(2)
    expect(g.stats()).toMatchObject({ mode: 'audit', total: 3, entries: [{ path: '/api/sessions/x/command', origin: 'https://evil.example', count: 3 }] })
  })

  it('enforce refuses foreign upgrades and POSTs, allows the rest', () => {
    const { g, lines } = guard('enforce')
    expect(g.check(evilPost).allow).toBe(false)
    expect(g.check({ url: '/term?name=a', headers: { host: H, origin: 'https://evil.example' } }, { upgrade: true }).allow).toBe(false)
    expect(g.check({ url: '/term?name=a', headers: { host: H } }, { upgrade: true }).allow).toBe(true)
    expect(g.check({ method: 'GET', url: '/api/x', headers: { host: H, origin: 'https://evil.example' } }).allow).toBe(true)
    expect(lines[1]).toBe('[origin-guard] refused WS /term: foreign-origin, Origin https://evil.example, Host localhost:23000')
  })

  it('off checks nothing', () => {
    const { g } = guard('off')
    expect(g.check(evilPost).allow).toBe(true)
    expect(g.stats().total).toBe(0)
  })

  it('the Doctor shows what audit mode would have refused', () => {
    const { g } = guard('audit')
    expect(checkCrossOrigin(g.stats())).toMatchObject({ status: 'pass' })
    g.check(evilPost)
    const c = checkCrossOrigin(g.stats())
    expect(c.status).toBe('warn')
    expect(c.message).toBe('1 browser request(s) would have been refused since the server started (mode: audit)')
    expect(c.items?.[0].message).toContain('POST /api/sessions/x/command would have been refused: foreign-origin, Origin https://evil.example')
  })

  it('originAllowed is what CORS reflects', () => {
    const { g } = guard('enforce')
    expect(g.originAllowed({ headers: { host: H, origin: 'https://maestro.acme.example' } })).toBe(true)
    expect(g.originAllowed({ headers: { host: H, origin: 'https://evil.example' } })).toBe(false)
    expect(g.originAllowed({ headers: { host: H } })).toBe(false)
  })
})
