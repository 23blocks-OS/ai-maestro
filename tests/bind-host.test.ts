import { describe, it, expect } from 'vitest'
import { resolveBindHost } from '@/lib/bind-host.mjs'

// A clean Ubuntu container: Docker exports HOSTNAME=<container id>, the server bound to that name, and
// http://localhost:23000 never answered (the installer said "service did not start").
describe('which address the server listens on', () => {
  it('listens on every interface by default', () => {
    expect(resolveBindHost({}, 'my-mac')).toBe('0.0.0.0')
    expect(resolveBindHost({ HOSTNAME: '' }, 'my-mac')).toBe('0.0.0.0')
    expect(resolveBindHost({ HOSTNAME: '  ' }, 'my-mac')).toBe('0.0.0.0')
  })

  it('ignores the machine\'s own name, which Docker, Kubernetes and some shells export on their own', () => {
    expect(resolveBindHost({ HOSTNAME: '6eee6b567e5a' }, '6eee6b567e5a')).toBe('0.0.0.0')
    expect(resolveBindHost({ HOSTNAME: 'juans-macbook-pro' }, 'juans-macbook-pro.local')).toBe('0.0.0.0')
    expect(resolveBindHost({ HOSTNAME: 'box.example.com' }, 'box.example.com')).toBe('0.0.0.0')
  })

  it('still honours a real override, as documented', () => {
    expect(resolveBindHost({ HOSTNAME: 'localhost' }, 'my-mac')).toBe('localhost')
    expect(resolveBindHost({ HOSTNAME: '127.0.0.1' }, 'my-mac')).toBe('127.0.0.1')
    expect(resolveBindHost({ HOSTNAME: '0.0.0.0' }, 'my-mac')).toBe('0.0.0.0')
    expect(resolveBindHost({ HOSTNAME: '100.64.1.2' }, 'my-mac')).toBe('100.64.1.2')
  })
})
