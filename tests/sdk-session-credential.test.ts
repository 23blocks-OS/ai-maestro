import { describe, it, expect } from 'vitest'
import { buildEnv, loadAgentCredential, credentialReady } from '@/lib/streaming-runtime.mjs'

describe('SDK sessions use the agent\'s own credential (#65)', () => {
  it('a token from the vault replaces this computer\'s login, and only after it is loaded', async () => {
    const cred = { kind: 'oauth-token' as const, secret: 'ACME_TOKEN' }
    expect(credentialReady('a1', cred)).toBe(false)
    expect(buildEnv('a1', 'alpha', cred).CLAUDE_CODE_OAUTH_TOKEN).not.toBe('tok-123')
    expect(await loadAgentCredential('a1', cred, async () => ' tok-\n123 ')).toBe(true)
    expect(credentialReady('a1', cred)).toBe(true)
    const env = buildEnv('a1', 'alpha', cred)
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('tok-123')
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    // another credential on the agent: not ready until read again
    expect(credentialReady('a1', { kind: 'oauth-token', secret: 'OTHER' })).toBe(false)
  })

  it('an API key, a gateway and a config folder map like the terminal launcher', async () => {
    await loadAgentCredential('a2', { kind: 'api-key', secret: 'K' }, async () => 'sk-x')
    expect(buildEnv('a2', 'b', { kind: 'api-key', secret: 'K' }).ANTHROPIC_API_KEY).toBe('sk-x')
    const gw = { kind: 'gateway' as const, secret: 'G', baseUrl: 'https://gw.example.com', model: 'm1' }
    await loadAgentCredential('a3', gw, async () => 'g-1')
    expect(buildEnv('a3', 'c', gw)).toMatchObject({ ANTHROPIC_AUTH_TOKEN: 'g-1', ANTHROPIC_BASE_URL: 'https://gw.example.com', ANTHROPIC_MODEL: 'm1' })
    const cd = { kind: 'config-dir' as const, dir: '/home/x/.claude-b' }
    await loadAgentCredential('a4', cd)
    const env = buildEnv('a4', 'd', cd)
    expect(env.CLAUDE_CONFIG_DIR).toBe('/home/x/.claude-b')
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
  })

  it('a missing or empty secret is not loaded; host login is unchanged', async () => {
    expect(await loadAgentCredential('a5', { kind: 'oauth-token', secret: 'NONE' }, async () => { throw new Error('missing') })).toBe(false)
    expect(await loadAgentCredential('a6', { kind: 'oauth-token', secret: 'EMPTY' }, async () => '')).toBe(false)
    expect(await loadAgentCredential('a7', { kind: 'host-login' })).toBe(false)
    expect(credentialReady('a7', { kind: 'host-login' })).toBe(true)
  })
})
