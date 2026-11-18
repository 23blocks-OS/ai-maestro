import { describe, it, expect } from 'vitest'
import { parseAuthStatus } from '@/lib/claude-login'
import { accountOf } from '@/lib/credential-words'

describe('which account a login is (#65 part 2)', () => {
  it('reads a stored claude.ai login, and nothing else', () => {
    expect(parseAuthStatus(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', email: 'ops@acme.example', orgName: 'Acme', planTier: 'max_20x' })))
      .toEqual({ email: 'ops@acme.example', orgName: 'Acme', plan: 'max_20x' })
    expect(parseAuthStatus(JSON.stringify({ loggedIn: true, authMethod: 'oauth_token' }))).toBeNull()
    expect(parseAuthStatus(JSON.stringify({ loggedIn: false }))).toBeNull()
    expect(parseAuthStatus('not json')).toBeNull()
  })
})

describe('the header account chip', () => {
  it('shows the host login when the agent has no setting', () => {
    // No setting is the host's own login: every agent shows its account
    expect(accountOf({ credentialLogin: { email: 'ops@acme.example', plan: 'max' } })?.label).toBe("the host's own login · ops@acme.example (max)")
  })
  it('names the account label, the login email and the check state', () => {
    const a = accountOf({ credential: { kind: 'host-login', account: 'Ops team' }, credentialLogin: { email: 'ops@acme.example', plan: 'max' }, credentialCheck: { state: 'mismatch', detail: 'x', at: '' } })
    expect(a?.label).toBe('Ops team · ops@acme.example (max)')
    expect(a?.state).toBe('mismatch')
    expect(accountOf({ credential: { kind: 'oauth-token', secret: 'ACME_MAX' } })?.label).toBe('subscription token ACME_MAX')
  })
})
