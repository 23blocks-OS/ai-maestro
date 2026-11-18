import { describe, it, expect } from 'vitest'
import { configuredSelfId } from '@/lib/hosts-config-server.mjs'

// macOS renamed the MacBook "mac.attlocal.net" (then "mac"); peers refused its forwards because it sent that name
const hosts = [
  { id: 'acme-laptop', aliases: ['acme-laptop', 'acme-laptop.local', '10.0.0.87', '100.104.0.1'] },
  { id: 'globex-mini', aliases: ['globex-mini', '100.80.0.2'] },
]

describe('this host keeps its configured id when the hostname drifts', () => {
  it('finds itself by hostname or alias', () => {
    expect(configuredSelfId(hosts, 'acme-laptop', [])).toBe('acme-laptop')
    expect(configuredSelfId(hosts, 'acme-laptop.local', [])).toBe('acme-laptop')
  })
  it('finds itself by IP when the hostname changed', () => {
    expect(configuredSelfId(hosts, 'mac.attlocal.net', ['100.104.0.1'])).toBe('acme-laptop')
  })
  it('gives up when the IP matches more than one host or none', () => {
    const twin = [...hosts, { id: 'other', aliases: ['100.104.0.1'] }]
    expect(configuredSelfId(twin, 'mac', ['100.104.0.1'])).toBeNull()
    expect(configuredSelfId(hosts, 'mac', ['192.168.1.5'])).toBeNull()
  })
})
