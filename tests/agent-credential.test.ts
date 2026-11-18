import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { parseCredential, credentialLaunchPrefix, settingsWarnings, describeCredential, credentialCheck, recordCredentialSeen, forgetCredentialSeen } from '@/lib/agent-credential'
import { buildLaunchCommand } from '@/lib/launch-command'

describe('credential profiles (#65)', () => {
  it('accepts vault names and addresses, never a value, and nothing that could break the command', () => {
    expect(parseCredential(null)).toEqual({ credential: null })
    expect(parseCredential({ kind: 'host-login' })).toEqual({ credential: null })
    expect(parseCredential({ kind: 'oauth-token', secret: 'PARTNER_MAX_TOKEN', account: "Partner's Max plan" })).toEqual({ credential: { kind: 'oauth-token', secret: 'PARTNER_MAX_TOKEN', account: "Partner's Max plan" } })
    expect(parseCredential({ kind: 'gateway', secret: 'GW_KEY', baseUrl: 'https://gw.example.com/api', model: 'vendor/model-1' })).toMatchObject({ credential: { baseUrl: 'https://gw.example.com/api', model: 'vendor/model-1' } })
    expect('error' in parseCredential({ kind: 'oauth-token', secret: 'sk-ant-oat01-abcdef' })).toBe(true) // a pasted value
    expect('error' in parseCredential({ kind: 'oauth-token', secret: 'A;rm -rf ~' })).toBe(true)
    expect('error' in parseCredential({ kind: 'gateway', secret: 'K', baseUrl: 'http://gw.example.com' })).toBe(true)
    expect('error' in parseCredential({ kind: 'config-dir', dir: '/a/../b' })).toBe(true)
    expect('error' in parseCredential({ kind: 'api-key', secret: 'K', value: 'x' })).toBe(true)
    expect('error' in parseCredential({ kind: 'magic' })).toBe(true)
  })

  it('puts the launcher in front of the whole Claude Code command, and nothing for the host login or other tools', () => {
    const L = '/repo/scripts/aim-launch.sh'
    expect(credentialLaunchPrefix({ kind: 'oauth-token', secret: 'TOK' }, L)).toBe(`${L} oauth-token TOK -- `)
    expect(credentialLaunchPrefix({ kind: 'gateway', secret: 'K', baseUrl: 'https://g.example.com' }, L)).toBe(`${L} gateway K https://g.example.com -- `)
    expect(credentialLaunchPrefix({ kind: 'config-dir', dir: '/Users/a/.claude-b' }, L)).toBe(`${L} config-dir /Users/a/.claude-b -- `)
    expect(credentialLaunchPrefix(null, L)).toBe('')
    expect(credentialLaunchPrefix({ kind: 'oauth-token', secret: 'bad;name' } as any, L)).toBe('')
    const cmd = buildLaunchCommand({ command: 'claude', kind: 'claude', agentName: 'ada', credential: { kind: 'oauth-token', secret: 'TOK' }, launcher: L, env: {} as any })
    expect(cmd.startsWith(`${L} oauth-token TOK -- `)).toBe(true)
    expect(cmd).toContain('CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 claude')
    expect(buildLaunchCommand({ command: 'codex', kind: 'codex', agentName: 'ada', credential: { kind: 'oauth-token', secret: 'TOK' }, launcher: L, env: {} as any })).not.toContain('aim-launch')
  })

  it('warns about settings that Claude Code ignores, or that would win over the profile, by name only', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-'))
    fs.mkdirSync(path.join(dir, '.claude'))
    // The incident: a subscription token in the local settings, and the old gateway variables left behind
    fs.writeFileSync(path.join(dir, '.claude', 'settings.local.json'), JSON.stringify({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'secret-value', ANTHROPIC_AUTH_TOKEN: 'old', ANTHROPIC_BASE_URL: 'https://old.example.com', OTHER: '1' } }))
    const w = settingsWarnings(dir, { kind: 'oauth-token', secret: 'TOK' })
    expect(w).toHaveLength(3)
    expect(w[0]).toContain('CLAUDE_CODE_OAUTH_TOKEN in env: Claude Code ignores it there')
    expect(w.join(' ')).toContain('ANTHROPIC_AUTH_TOKEN: it wins over')
    expect(w.join(' ')).not.toContain('secret-value')
    expect(settingsWarnings(path.join(dir, 'none'), null)).toEqual([])
    expect(describeCredential({ kind: 'gateway', secret: 'K', baseUrl: 'https://gw.example.com/x', account: 'team' })).toBe('gateway gw.example.com with K (team)')
  })

  it('the launcher script parses', async () => {
    const { execFileSync } = await import('child_process')
    expect(() => execFileSync('bash', ['-n', path.join(process.cwd(), 'scripts', 'aim-launch.sh')])).not.toThrow()
  })
})

describe('live credential check (#65 part 2)', () => {
  const token = { kind: 'oauth-token' as const, secret: 'ACME_MAX_TOKEN' }
  const seen = (via: any, launched?: any) => ({ via, launched, at: 0 })

  it('is silent without a report, and checks no setting as the host login', () => {
    // No setting is checked as the host's own login
    expect(credentialCheck(null, 'a', seen('api-key'))?.state).toBe('mismatch')
    expect(credentialCheck(null, 'a', seen('host-login'))?.state).toBe('match')
    expect(credentialCheck(token, 'nobody-reported')).toBeNull()
  })
  it('is red when the session falls back to the host login (the incident)', () => {
    expect(credentialCheck(token, 'a', seen('host-login', 'oauth-token'))?.state).toBe('mismatch')
    expect(credentialCheck(token, 'a', seen('api-key', 'oauth-token'))?.state).toBe('mismatch')
    expect(credentialCheck({ kind: 'host-login' }, 'a', seen('api-key'))?.state).toBe('mismatch')
  })
  it('needs the launcher mark for a match, amber without it', () => {
    expect(credentialCheck(token, 'a', seen('oauth-token', 'oauth-token'))?.state).toBe('match')
    expect(credentialCheck(token, 'a', seen('oauth-token'))?.state).toBe('unverified')
    // started by a hand wrapper: the token is invisible to the hook, so not red
    expect(credentialCheck(token, 'a', seen('host-login'))?.state).toBe('unverified')
    expect(credentialCheck({ kind: 'host-login' }, 'a', seen('host-login'))?.state).toBe('match')
  })
  it('records only well-formed reports, and forgets them at wake', () => {
    recordCredentialSeen('acme-1', { via: 'sk-ant-pasted-value' })
    expect(credentialCheck(token, 'acme-1')).toBeNull()
    recordCredentialSeen('acme-1', { via: 'oauth-token', launched: 'oauth-token', extra: 'x' })
    expect(credentialCheck(token, 'acme-1')?.state).toBe('match')
    const at = credentialCheck(token, 'acme-1')?.at
    recordCredentialSeen('acme-1', { via: 'oauth-token', launched: 'oauth-token' })
    expect(credentialCheck(token, 'acme-1')?.at).toBe(at) // a repeat report does not move it
    forgetCredentialSeen('acme-1')
    expect(credentialCheck(token, 'acme-1')).toBeNull()
  })
})
