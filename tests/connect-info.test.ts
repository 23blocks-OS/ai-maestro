import { describe, it, expect } from 'vitest'
import { buildConnectInfo } from '@/lib/connect-info'

const dns = 'mac.tail.ts.net'
const status = { Self: { DNSName: `${dns}.`, TailscaleIPs: ['100.104.178.57', 'fd7a::1'] } }
const serve = (proxy: string) => ({ Web: { [`${dns}:443`]: { Handlers: { '/': { Proxy: proxy } } } } })
const base = { hostId: 'mac', name: 'MacBook Pro', organization: 'rnd23blocks', port: 23000, bindHost: '0.0.0.0', localIPs: [{ ip: '192.168.1.20', interface: 'en0' }, { ip: '100.104.178.57', interface: 'utun4' }] }

describe('buildConnectInfo', () => {
  it('lists addresses best first, and the link repeats them in that order', () => {
    const info = buildConnectInfo({ ...base, tailscaleStatus: status, tailscaleServe: serve('http://localhost:23000') })
    expect(info.urls).toEqual([`https://${dns}`, 'http://100.104.178.57:23000', 'http://192.168.1.20:23000'])
    expect(info.link).toBe(`aimaestro://connect?v=1&id=mac&name=MacBook%20Pro&org=rnd23blocks&u=https%3A%2F%2F${dns}&u=http%3A%2F%2F100.104.178.57%3A23000&u=http%3A%2F%2F192.168.1.20%3A23000`)
  })

  it('leaves out HTTPS when port 443 serves something else, as on mac-mini', () => {
    const info = buildConnectInfo({ ...base, tailscaleStatus: status, tailscaleServe: serve('http://127.0.0.1:4321') })
    expect(info.urls[0]).toBe('http://100.104.178.57:23000')
  })

  it('works with no Tailscale, and with Tailscale but no serve', () => {
    expect(buildConnectInfo({ ...base, localIPs: [{ ip: '10.0.0.5', interface: 'enp3s0f0' }] }).urls).toEqual(['http://10.0.0.5:23000'])
    expect(buildConnectInfo({ ...base, tailscaleStatus: status, tailscaleServe: {} }).urls).toHaveLength(2)
  })

  it('offers only what the server listens on', () => {
    expect(buildConnectInfo({ ...base, bindHost: '127.0.0.1' }).urls).toEqual([])
    expect(buildConnectInfo({ ...base, bindHost: '127.0.0.1', tailscaleStatus: status, tailscaleServe: serve('http://127.0.0.1:23000') }).urls).toEqual([`https://${dns}`])
    expect(buildConnectInfo({ ...base, bindHost: '192.168.1.20' }).urls).toEqual(['http://192.168.1.20:23000'])
  })

  it('leaves out Docker and VM networks, as this Mac has seven', () => {
    const localIPs = [{ ip: '10.0.0.79', interface: 'en0' }, { ip: '100.104.178.57', interface: 'utun4' }, { ip: '192.168.139.3', interface: 'bridge100' }, { ip: '192.168.215.0', interface: 'bridge101' }, { ip: '10.1.0.1', interface: 'docker0' }, { ip: '10.2.0.1', interface: 'br-1a2b' }, { ip: '192.168.122.1', interface: 'virbr0' }]
    expect(buildConnectInfo({ ...base, localIPs }).urls).toEqual(['http://100.104.178.57:23000', 'http://10.0.0.79:23000'])
  })

  it('ignores addresses a phone cannot use, and a host with no organization has no org', () => {
    const info = buildConnectInfo({ ...base, organization: undefined, localIPs: [{ ip: '8.8.8.8', interface: 'en0' }, { ip: '100.1.2.3', interface: 'en0' }, { ip: '169.254.1.1', interface: 'en0' }] })
    expect(info.urls).toEqual([])
    expect(info.link).toBe('aimaestro://connect?v=1&id=mac&name=MacBook%20Pro')
    expect(info).not.toHaveProperty('organization')
  })
})
