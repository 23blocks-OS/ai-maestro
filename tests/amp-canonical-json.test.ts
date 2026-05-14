import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { canonicalStringify } from '@/lib/amp-canonical-json'

describe('canonicalStringify', () => {
  it('sorts top-level object keys lexicographically', () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
    expect(canonicalStringify({ z: 1, a: 1, m: 1 })).toBe('{"a":1,"m":1,"z":1}')
  })

  it('produces compact separators (no spaces)', () => {
    expect(canonicalStringify({ a: 1, b: [2, 3] })).toBe('{"a":1,"b":[2,3]}')
  })

  it('sorts keys at all nesting levels', () => {
    const out = canonicalStringify({
      outer_b: { inner_b: 1, inner_a: 2 },
      outer_a: { inner_z: { deep_b: 1, deep_a: 2 } },
    })
    expect(out).toBe(
      '{"outer_a":{"inner_z":{"deep_a":2,"deep_b":1}},"outer_b":{"inner_a":2,"inner_b":1}}'
    )
  })

  it('preserves array order (arrays are data, not metadata)', () => {
    expect(canonicalStringify([3, 1, 2])).toBe('[3,1,2]')
    expect(canonicalStringify(['z', 'a', 'm'])).toBe('["z","a","m"]')
  })

  it('sorts keys inside objects within arrays', () => {
    expect(canonicalStringify([{ b: 1, a: 2 }, { d: 3, c: 4 }])).toBe(
      '[{"a":2,"b":1},{"c":4,"d":3}]'
    )
  })

  it('handles null, primitives, and empty containers', () => {
    expect(canonicalStringify(null)).toBe('null')
    expect(canonicalStringify(42)).toBe('42')
    expect(canonicalStringify('hello')).toBe('"hello"')
    expect(canonicalStringify(true)).toBe('true')
    expect(canonicalStringify({})).toBe('{}')
    expect(canonicalStringify([])).toBe('[]')
  })

  it('produces identical output for objects with same content but different insertion order', () => {
    const a = { from: 'alice', to: 'bob', subject: 'hi', priority: 'normal' }
    const b = { priority: 'normal', subject: 'hi', to: 'bob', from: 'alice' }
    expect(canonicalStringify(a)).toBe(canonicalStringify(b))
  })

  it('produces a stable signature input regardless of key insertion order', () => {
    // Pinned regression vector. Any future refactor that re-introduces bare
    // JSON.stringify() will break this hash.
    const payload = { type: 'task', body: 'do the thing', priority: 'high', sender: 'agent-x' }
    const expectedHash = crypto
      .createHash('sha256')
      .update(canonicalStringify(payload))
      .digest('base64')

    // Same content, different insertion order — must produce identical hash.
    const reordered = { sender: 'agent-x', priority: 'high', body: 'do the thing', type: 'task' }
    const reorderedHash = crypto
      .createHash('sha256')
      .update(canonicalStringify(reordered))
      .digest('base64')
    expect(reorderedHash).toBe(expectedHash)

    // Pin the exact canonical bytes + hash. Mint-our-own compliant vector
    // until a real crabmail-shaped reference vector is available.
    expect(canonicalStringify(payload)).toBe(
      '{"body":"do the thing","priority":"high","sender":"agent-x","type":"task"}'
    )
    expect(expectedHash).toBe('gj18mS8lzjuRPADL7h4ke5Ku5vFJaTUjElh/vC+aVCw=')
  })

  it('canonicalizes deeply-nested AMP-shaped envelope payloads', () => {
    const payload = {
      meta: { team: 'iron-syndicate', host: 'milo' },
      attachments: [{ size: 1234, name: 'log.txt', kind: 'amp-v1' }],
      body: 'check the run',
      type: 'notification',
    }
    expect(canonicalStringify(payload)).toBe(
      '{"attachments":[{"kind":"amp-v1","name":"log.txt","size":1234}],"body":"check the run","meta":{"host":"milo","team":"iron-syndicate"},"type":"notification"}'
    )
  })

  it('canonicalizes the federated webhook delivery body shape', () => {
    // Pinned vector matching lib/message-delivery.ts:157 — the body fed into
    // the X-AMP-Signature webhook HMAC. Same key-order independence concern
    // as the AMP envelope signature, since a compliant peer that re-parses
    // and re-canonicalizes for verification would silently fail with bare
    // JSON.stringify on the sender side.
    const webhookBody = {
      sender_public_key: 'ed25519-public-hex',
      payload: { type: 'task', body: 'do the thing' },
      envelope: { to: 'bob@host', subject: 'hi', from: 'alice@host' },
    }
    expect(canonicalStringify(webhookBody)).toBe(
      '{"envelope":{"from":"alice@host","subject":"hi","to":"bob@host"},"payload":{"body":"do the thing","type":"task"},"sender_public_key":"ed25519-public-hex"}'
    )
  })
})
