/**
 * Tests for lib/memory/redact.ts.
 *
 * Memories are stored verbatim, sent to an external classifier, and injected
 * back into prompts. The first real consolidation run surfaced a production
 * database password in plain text. These fixtures are fake, but in the same
 * shapes that appear in real transcripts.
 */

import { describe, it, expect } from 'vitest'
import { redactSecrets } from '@/lib/memory/redact'
import { chunkConversation } from '@/lib/memory/jev-provider'

const cases: Array<[string, string, string]> = [
  ['password in backticks, prose', 'Prod DB password `Fak3Pass99` (exposed in git history)', 'Fak3Pass99'],
  ['Stripe live key', 'rotate sk_live_51FakeFakeFake0000abcd now', 'sk_live_51FakeFakeFake0000abcd'],
  ['Anthropic key', 'ANTHROPIC_API_KEY=sk-ant-api03-FAKEFAKEFAKEFAKEFAKE1234', 'sk-ant-api03-FAKEFAKEFAKEFAKEFAKE1234'],
  ['GitHub token', 'token ghp_FAKEfakeFAKEfakeFAKEfake1234', 'ghp_FAKEfakeFAKEfakeFAKEfake1234'],
  ['AWS key id', 'AKIAFAKEFAKEFAKE1234 is the key', 'AKIAFAKEFAKEFAKE1234'],
  ['Mandrill', 'Mandrill `md-FAKEfakeFAKEfake12` key', 'md-FAKEfakeFAKEfake12'],
  ['Jev key', 'here is the Key: apikey_000fake000fake000fake_1234', 'apikey_000fake000fake000fake_1234'],
  ['connection string', 'DATABASE_URL=postgres://app:S3cr3tPw@db.internal:5432/prod', 'S3cr3tPw'],
  ['env assignment', 'DB_PASSWORD="n0tR3alButSecret"', 'n0tR3alButSecret'],
  ['yaml secret', 'client_secret: abcd1234efgh5678', 'abcd1234efgh5678'],
  ['JWT', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.c2lnbmF0dXJlZmFrZQ', 'eyJhbGciOiJIUzI1NiJ9'],
  ['private key', '-----BEGIN RSA PRIVATE KEY-----\nMIIfake\n-----END RSA PRIVATE KEY-----', 'MIIfake'],
  ['quoted key in prose', "apps use a hardcoded encryption key ('fakeKeyValue9' + salt 'fakeSaltValue7'), identical everywhere", 'fakeKeyValue9'],
  ['quoted salt after a key', "apps use a hardcoded encryption key ('fakeKeyValue9' + salt 'fakeSaltValue7'), identical everywhere", 'fakeSaltValue7'],
  ['token is "value"', 'the token is "tok_fake_12345" for staging', 'tok_fake_12345'],
  ['bare key in parentheses', 'Zoom does not need the legacy shared encryption key (fakeLegacy42); it has no data', 'fakeLegacy42'],
]

describe('redactSecrets', () => {
  for (const [name, input, secret] of cases) {
    it(`redacts ${name}`, () => {
      const out = redactSecrets(input)
      expect(out).not.toContain(secret)
      expect(out).toContain('[REDACTED]')
    })
  }

  it('leaves ordinary engineering text alone', () => {
    const text = 'We decided to store memories verbatim; the password reset flow lives in auth-api and uses tokens with a 15 minute TTL.'
    expect(redactSecrets(text)).toBe(text)
  })

  it('keeps the structure of a connection string', () => {
    expect(redactSecrets('postgres://app:S3cr3tPw@db.internal:5432/prod')).toBe('postgres://app:[REDACTED]@db.internal:5432/prod')
  })
})

describe('chunkConversation redacts before classification and storage', () => {
  it('never puts a secret in a passage or its classifier state', () => {
    const msgs = [
      { role: 'user' as const, content: `rotate the prod DB password \`Fak3Pass99\` and sk_live_51FakeFakeFake0000abcd ${'x'.repeat(60)}` },
      { role: 'assistant' as const, content: `Rotation plan: the password \`Fak3Pass99\` was exposed in git history, so it goes first. ${'y'.repeat(120)}` },
    ]
    const passages = chunkConversation(msgs, 0).flatMap(c => c.passages)
    const everything = passages.map(p => p.text + p.state).join('\n')
    expect(passages.length).toBeGreaterThan(0)
    expect(everything).not.toContain('Fak3Pass99')
    expect(everything).not.toContain('sk_live_51FakeFakeFake0000abcd')
  })
})

// Learn a secret once, redact it everywhere. The real key reached cards as
// ENV=value, "hardcoded `value`", "key (value)" and bare "retain value because…".
describe('secret values: learned once, redacted in any form', () => {
  it('learns values from assignments, quotes and parentheses, not ordinary words', async () => {
    const { extractSecretValues } = await import('@/lib/memory/redact')
    const text = "wire ENCRYPTION_SERVICE_KEY=fakeK3yValue9 and ENCRYPTION_SERVICE_SALT=fakesaltvaluelong; the sort key is name; password: changeme"
    const values = extractSecretValues(text)
    expect(values).toContain('fakeK3yValue9')
    expect(values).toContain('fakesaltvaluelong')
    expect(values).not.toContain('name')
    expect(values).not.toContain('changeme')
  })

  it('redacts every later mention of a known value, however it is written', async () => {
    const { extractSecretValues, hashSecret, redactSecrets } = await import('@/lib/memory/redact')
    const known = new Set(extractSecretValues('ENCRYPTION_SERVICE_KEY=fakeK3yValue9').map(hashSecret))
    const bare = '23blocks production must retain fakeK3yValue9 because other tenants use it. RAG had hardcoded `fakeK3yValue9`.'
    const out = redactSecrets(bare, known)
    expect(out).not.toContain('fakeK3yValue9')
    expect(out).toContain('must retain [REDACTED] because')
  })

  it('never stores or needs the value: only its hash', async () => {
    const { hashSecret } = await import('@/lib/memory/redact')
    expect(hashSecret('fakeK3yValue9')).toMatch(/^[0-9a-f]{64}$/)
  })
})
