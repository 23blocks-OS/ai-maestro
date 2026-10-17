import { describe, it, expect } from 'vitest'
import { verifyProviderRequest } from '@/lib/amp-federation-auth'
import { checkSignature } from '@/lib/amp-trust'

// Format sample from Crabmail's own signing code (signFederationRequest), made with
// throwaway keys. It proves both sides sign the same bytes; it is not a capture from crabmail.ai.
const PROVIDER_KEY = 'cbfc643bd1d44e94fbe5a9d320fcfea8ab1d1a290b131212d8dde42c2cce0442'
const TS = '1792000000'
const SIG = 'ibiVLuGq3n7u2Vzgh9eAUJv+K1OkOxD2aCq1Nw05jh5jK3jLQuo95pr0C8Lld1CKIQnG81IiQ0tm/vzTMzB8DA=='
const RAW = '{"envelope":{"id":"msg_1792000000_sample000001","from":"alice@acme.crabmail.ai","to":"bob@their.host","subject":"Sample","priority":"normal","timestamp":"2026-10-17T00:00:00.000Z","expires_at":"2026-10-24T00:00:00.000Z","thread_id":"msg_1792000000_sample000001","signature":"O9bnNxMOpO59VmJz1v6Pm6pAct2GIQe6hdl/Jwrg0xvgG5eI1KFim3BAaxpCHxpM/3ENrLPSf4I76MI6AObGDw=="},"payload":{"type":"notification","message":"hello from the sample"},"sender_public_key":"60369915c71f6cf378f32327dcd607740844e28cffb5508d1ee7dfb70408aece"}'

describe('Crabmail format sample', () => {
  const doc = async () => ({ public_key: PROVIDER_KEY })
  it('provider signature verifies over "<timestamp>.<raw body>"', async () => {
    const r = await verifyProviderRequest({ provider: 'crabmail.ai', timestamp: TS, signature: SIG, rawBody: RAW, nowMs: 1792000000_000, fetchDoc: doc })
    expect(r.ok).toBe(true)
  })
  it('a changed body fails', async () => {
    const r = await verifyProviderRequest({ provider: 'crabmail.ai', timestamp: TS, signature: SIG, rawBody: RAW.replace('hello', 'HELLO'), nowMs: 1792000000_000, fetchDoc: doc })
    expect(r.ok).toBe(false)
  })
  it('sender signature verifies with the key in the body', () => {
    const b = JSON.parse(RAW)
    const e = b.envelope
    const check = checkSignature({ from: e.from, to: e.to, subject: e.subject, priority: e.priority, in_reply_to: null, payload: b.payload }, e.signature, b.sender_public_key)
    expect(check).toBe('verified')
  })
})
