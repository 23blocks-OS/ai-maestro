import { describe, it, expect } from 'vitest'
import { isRemoteHost, isSelfHost } from '@/lib/host-kind'

// Hosts as /api/hosts returns them on a real mesh: most carry no `type` at all.
const self = { isSelf: true, url: 'http://100.104.178.57:23000' }
const noType = { isSelf: false, url: 'http://100.80.12.6:23000' }
const legacy = { isSelf: false, url: 'http://100.76.17.128:23000', type: 'remote' } as const

describe('host kind does not depend on the deprecated type field', () => {
  it('a peer without type is remote', () => {
    expect(isRemoteHost(noType)).toBe(true)
    expect(isRemoteHost(legacy)).toBe(true)
  })
  it('this machine is not remote, however its URL is written', () => {
    expect(isRemoteHost(self)).toBe(false)
    expect(isRemoteHost({ url: 'http://localhost:23000' })).toBe(false)
    expect(isSelfHost(self)).toBe(true)
    expect(isSelfHost({ url: 'http://127.0.0.1:23000' })).toBe(true)
  })
  it('a peer is not self', () => {
    expect(isSelfHost(noType)).toBe(false)
  })
  it('an unknown host is neither', () => {
    expect(isRemoteHost(undefined)).toBe(false)
    expect(isSelfHost(undefined)).toBe(false)
  })
})
