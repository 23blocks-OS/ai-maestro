/**
 * Agents Docker Service — pure helpers
 *
 * Covers the sandbox.mounts validation + docker `-v` flag construction.
 * The full createDockerAgent flow is integration-tested elsewhere; these tests
 * pin down the narrow contract that determines what gets shelled out.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  validateMounts,
  validateExtraEnv,
  buildMountFlags,
  buildEnvFlags,
  buildAmpCommonMounts,
  buildAmpCommonEnv,
  buildCloudClaudeSettingsMount,
  buildCloudClaudePersistMounts,
  buildCloudGeminiSettingsMount,
  buildCloudGeminiOAuthMount,
  buildCloudCodexVersionMount,
  buildCloudCodexAuthMount,
  buildCloudCodexConfigTomlMount,
  migrateAgentPersistence,
  provisionCloudClaudeConfig,
  provisionCloudGeminiConfig,
  provisionCloudGeminiAuth,
  provisionCloudCodexConfig,
  provisionCloudCodexAuth,
  seedFromHostFile,
  mergeMounts,
  mergeEnv,
  buildRecreateBody,
  RECREATE_PRESERVED_FIELDS,
} from '@/services/agents-docker-service'
import type { Agent, SandboxMount } from '@/types/agent'

describe('validateMounts', () => {
  it('returns null for undefined mounts', () => {
    expect(validateMounts(undefined)).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(validateMounts([])).toBeNull()
  })

  it('accepts a well-formed mount', () => {
    const mounts: SandboxMount[] = [
      { hostPath: '/home/user/code', containerPath: '/work/code' },
    ]
    expect(validateMounts(mounts)).toBeNull()
  })

  it('accepts readOnly flag', () => {
    const mounts: SandboxMount[] = [
      { hostPath: '/etc/secrets', containerPath: '/secrets', readOnly: true },
    ]
    expect(validateMounts(mounts)).toBeNull()
  })

  it('rejects relative hostPath', () => {
    const mounts: SandboxMount[] = [
      { hostPath: 'relative/path', containerPath: '/work' },
    ]
    expect(validateMounts(mounts)).toMatch(/absolute/)
  })

  it('rejects relative containerPath', () => {
    const mounts: SandboxMount[] = [
      { hostPath: '/home/user', containerPath: 'work' },
    ]
    expect(validateMounts(mounts)).toMatch(/absolute/)
  })

  it('rejects missing hostPath', () => {
    const mounts = [{ containerPath: '/work' } as unknown as SandboxMount]
    expect(validateMounts(mounts)).toMatch(/hostPath/)
  })

  it('rejects shell-injection characters in paths', () => {
    const cases: SandboxMount[][] = [
      [{ hostPath: '/home/$(whoami)', containerPath: '/work' }],
      [{ hostPath: '/home/user', containerPath: '/work";rm -rf /;"' }],
      [{ hostPath: '/home/`id`', containerPath: '/work' }],
      [{ hostPath: "/home/'evil'", containerPath: '/work' }],
      [{ hostPath: '/home/user\nbad', containerPath: '/work' }],
      [{ hostPath: '/home/user\\evil', containerPath: '/work' }],
    ]
    for (const mounts of cases) {
      expect(validateMounts(mounts)).toMatch(/quotes|backticks|\$|backslashes|newlines/)
    }
  })

  it('reserves /workspace for the working directory mount', () => {
    const mounts: SandboxMount[] = [
      { hostPath: '/home/user/code', containerPath: '/workspace' },
    ]
    expect(validateMounts(mounts)).toMatch(/reserved/)
  })

  it('reports the offending index when multiple mounts are provided', () => {
    const mounts: SandboxMount[] = [
      { hostPath: '/ok', containerPath: '/ok' },
      { hostPath: 'bad', containerPath: '/ok' },
    ]
    expect(validateMounts(mounts)).toMatch(/mounts\[1\]/)
  })
})

describe('buildMountFlags', () => {
  it('returns empty array for undefined mounts', () => {
    expect(buildMountFlags(undefined)).toEqual([])
  })

  it('returns empty array for empty mounts', () => {
    expect(buildMountFlags([])).toEqual([])
  })

  it('produces a single -v flag per mount', () => {
    const mounts: SandboxMount[] = [
      { hostPath: '/home/user/code', containerPath: '/work/code' },
    ]
    expect(buildMountFlags(mounts)).toEqual([
      '-v "/home/user/code:/work/code"',
    ])
  })

  it('appends :ro for readOnly mounts', () => {
    const mounts: SandboxMount[] = [
      { hostPath: '/etc/ssl/certs', containerPath: '/certs', readOnly: true },
    ]
    expect(buildMountFlags(mounts)).toEqual([
      '-v "/etc/ssl/certs:/certs:ro"',
    ])
  })

  it('omits :ro when readOnly is false', () => {
    const mounts: SandboxMount[] = [
      { hostPath: '/home/user', containerPath: '/work', readOnly: false },
    ]
    expect(buildMountFlags(mounts)).toEqual([
      '-v "/home/user:/work"',
    ])
  })

  it('preserves order across multiple mounts', () => {
    const mounts: SandboxMount[] = [
      { hostPath: '/a', containerPath: '/x' },
      { hostPath: '/b', containerPath: '/y', readOnly: true },
      { hostPath: '/c', containerPath: '/z' },
    ]
    expect(buildMountFlags(mounts)).toEqual([
      '-v "/a:/x"',
      '-v "/b:/y:ro"',
      '-v "/c:/z"',
    ])
  })
})

describe('validateExtraEnv', () => {
  it('returns null for undefined', () => {
    expect(validateExtraEnv(undefined)).toBeNull()
  })

  it('returns null for empty object', () => {
    expect(validateExtraEnv({})).toBeNull()
  })

  it('accepts well-formed env entries', () => {
    expect(validateExtraEnv({ FOO: 'bar', BAZ_QUX: '1', _LEADING: 'ok' })).toBeNull()
  })

  it('rejects invalid key shapes', () => {
    expect(validateExtraEnv({ '1FOO': 'bar' })).toMatch(/invalid key/)
    expect(validateExtraEnv({ 'foo-bar': 'baz' })).toMatch(/invalid key/)
    expect(validateExtraEnv({ 'FOO BAR': 'baz' })).toMatch(/invalid key/)
    expect(validateExtraEnv({ '': 'baz' })).toMatch(/invalid key/)
  })

  it('rejects shell-injection characters in values', () => {
    const cases: Record<string, string>[] = [
      { FOO: '$(whoami)' },
      { FOO: 'a"b' },
      { FOO: "a'b" },
      { FOO: 'a`b' },
      { FOO: 'a\nb' },
      { FOO: 'a\\b' },
    ]
    for (const env of cases) {
      expect(validateExtraEnv(env)).toMatch(/quotes|backticks|\$|backslashes|newlines/)
    }
  })

  it('rejects non-string values', () => {
    expect(validateExtraEnv({ FOO: 123 as unknown as string })).toMatch(/must be a string/)
  })
})

describe('buildEnvFlags', () => {
  it('returns empty array for undefined', () => {
    expect(buildEnvFlags(undefined)).toEqual([])
  })

  it('returns empty array for empty object', () => {
    expect(buildEnvFlags({})).toEqual([])
  })

  it('produces a single -e flag per entry', () => {
    expect(buildEnvFlags({ FOO: 'bar', BAZ: 'qux' })).toEqual([
      '-e FOO="bar"',
      '-e BAZ="qux"',
    ])
  })
})

describe('buildAmpCommonMounts', () => {
  const uuid = '11111111-1111-1111-1111-111111111111'
  const home = '/home/gosub'

  it('returns five mounts derived from the agent UUID + host shared paths', () => {
    const mounts = buildAmpCommonMounts(uuid, home)
    expect(mounts).toHaveLength(5)
    expect(mounts.map(m => m.containerPath)).toEqual([
      `/home/claude/.agent-messaging/agents/${uuid}`,
      `/home/claude/.aimaestro/agents/${uuid}`,
      '/home/claude/.local/bin',
      '/home/claude/.local/share/aimaestro/shell-helpers',
      '/home/claude/.local/share/aimaestro/cli',
    ])
  })

  it('mirrors host paths under the supplied home + repoRoot', () => {
    const mounts = buildAmpCommonMounts(uuid, home, '/srv/ai-maestro')
    expect(mounts.map(m => m.hostPath)).toEqual([
      `${home}/.agent-messaging/agents/${uuid}`,
      `${home}/.aimaestro/agents/${uuid}`,
      `${home}/.local/bin`,
      `${home}/.local/share/aimaestro/shell-helpers`,
      '/srv/ai-maestro/scripts',
    ])
  })

  it('repoRoot defaults to process.cwd() (matches provisionCloudClaudeConfig precedent)', () => {
    const mounts = buildAmpCommonMounts(uuid, home)
    const cli = mounts.find(m => m.containerPath === '/home/claude/.local/share/aimaestro/cli')
    expect(cli?.hostPath).toBe(`${process.cwd()}/scripts`)
  })

  it('marks the repo cli mount read-only', () => {
    const mounts = buildAmpCommonMounts(uuid, home)
    const cli = mounts.find(m => m.containerPath === '/home/claude/.local/share/aimaestro/cli')
    expect(cli?.readOnly).toBe(true)
  })

  it('marks the AMP CLI mount read-only', () => {
    const mounts = buildAmpCommonMounts(uuid, home)
    const cli = mounts.find(m => m.containerPath === '/home/claude/.local/bin')
    expect(cli?.readOnly).toBe(true)
  })

  it('marks the shell-helpers mount read-only', () => {
    const mounts = buildAmpCommonMounts(uuid, home)
    const helpers = mounts.find(m => m.containerPath === '/home/claude/.local/share/aimaestro/shell-helpers')
    expect(helpers?.readOnly).toBe(true)
  })

  it('leaves identity mounts read-write', () => {
    const mounts = buildAmpCommonMounts(uuid, home)
    const idAmp = mounts.find(m => m.containerPath === `/home/claude/.agent-messaging/agents/${uuid}`)
    const idMaestro = mounts.find(m => m.containerPath === `/home/claude/.aimaestro/agents/${uuid}`)
    expect(idAmp?.readOnly).toBeFalsy()
    expect(idMaestro?.readOnly).toBeFalsy()
  })

  it('does not include a wholesale ~/.claude mount', () => {
    const mounts = buildAmpCommonMounts(uuid, home)
    expect(mounts.find(m => m.containerPath === '/home/claude/.claude')).toBeUndefined()
    expect(mounts.find(m => m.hostPath === `${home}/.claude`)).toBeUndefined()
  })

  it('passes the SandboxMount validator', () => {
    const mounts = buildAmpCommonMounts(uuid, home)
    expect(validateMounts(mounts)).toBeNull()
  })
})

describe('buildCloudClaudeSettingsMount', () => {
  const uuid = '33333333-3333-3333-3333-333333333333'
  const home = '/home/gosub'

  it('returns a file-level mount targeting /home/claude/.claude/settings.json', () => {
    const m = buildCloudClaudeSettingsMount(uuid, home)
    expect(m.hostPath).toBe(`${home}/.aimaestro/agents/${uuid}/claude-settings.json`)
    expect(m.containerPath).toBe('/home/claude/.claude/settings.json')
  })

  it('is read-write — claude writes settings.json on bypass-accept and tool config flows', () => {
    expect(buildCloudClaudeSettingsMount(uuid, home).readOnly).toBeFalsy()
  })

  it('passes the SandboxMount validator', () => {
    expect(validateMounts([buildCloudClaudeSettingsMount(uuid, home)])).toBeNull()
  })
})

describe('buildCloudClaudePersistMounts', () => {
  const uuid = '55555555-5555-5555-5555-555555555555'
  const home = '/home/gosub'

  it('returns three mounts under the per-agent state dir', () => {
    const mounts = buildCloudClaudePersistMounts(uuid, home)
    expect(mounts).toHaveLength(3)
    expect(mounts.map(m => m.containerPath)).toEqual([
      '/home/claude/.claude.json',
      '/home/claude/.claude/.credentials.json',
      '/home/claude/.config/gh',
    ])
  })

  it('sources every mount from ~/.aimaestro/agents/<id>/', () => {
    const mounts = buildCloudClaudePersistMounts(uuid, home)
    const agentDir = `${home}/.aimaestro/agents/${uuid}`
    expect(mounts.map(m => m.hostPath)).toEqual([
      `${agentDir}/claude-home.json`,
      `${agentDir}/claude-credentials.json`,
      `${agentDir}/gh-config`,
    ])
  })

  it('keeps all persistence mounts read-write (claude/gh need to write state back)', () => {
    const mounts = buildCloudClaudePersistMounts(uuid, home)
    for (const m of mounts) {
      expect(m.readOnly).toBeFalsy()
    }
  })

  it('does not leak host operator state — paths are per-agent, not host ~/.claude or ~/.config', () => {
    const mounts = buildCloudClaudePersistMounts(uuid, home)
    for (const m of mounts) {
      expect(m.hostPath.startsWith(`${home}/.aimaestro/agents/${uuid}/`)).toBe(true)
      expect(m.hostPath).not.toBe(`${home}/.claude.json`)
      expect(m.hostPath).not.toBe(`${home}/.claude/.credentials.json`)
      expect(m.hostPath).not.toBe(`${home}/.config/gh`)
    }
  })

  it('isolates per-agent state across UUIDs', () => {
    const a = buildCloudClaudePersistMounts('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', home)
    const b = buildCloudClaudePersistMounts('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', home)
    for (let i = 0; i < a.length; i++) {
      expect(a[i].hostPath).not.toBe(b[i].hostPath)
    }
  })

  it('passes the SandboxMount validator', () => {
    expect(validateMounts(buildCloudClaudePersistMounts(uuid, home))).toBeNull()
  })
})

describe('provisionCloudClaudeConfig', () => {
  const uuid = '44444444-4444-4444-4444-444444444444'
  let tmpHome: string
  let tmpRepo: string

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-home-'))
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-repo-'))
    const hookSrcDir = path.join(tmpRepo, 'scripts', 'claude-hooks')
    fs.mkdirSync(hookSrcDir, { recursive: true })
    fs.writeFileSync(path.join(hookSrcDir, 'ai-maestro-hook.cjs'), '// stub hook\nprocess.exit(0)\n')
  })

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true })
    fs.rmSync(tmpRepo, { recursive: true, force: true })
  })

  it('snapshots the hook script into the per-UUID dir', () => {
    const { hookPath } = provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    expect(hookPath).toBe(path.join(tmpHome, '.aimaestro', 'agents', uuid, 'claude-hook.cjs'))
    expect(fs.existsSync(hookPath)).toBe(true)
    expect(fs.readFileSync(hookPath, 'utf8')).toContain('stub hook')
  })

  it('makes the snapshotted hook executable', () => {
    const { hookPath } = provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    expect(fs.statSync(hookPath).mode & 0o111).not.toBe(0)
  })

  it('writes a settings.json with hook paths pointing at the container-side hook location', () => {
    const { settingsPath } = provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    const containerHook = `/home/claude/.aimaestro/agents/${uuid}/claude-hook.cjs`
    for (const event of ['Notification', 'Stop', 'SessionStart', 'UserPromptSubmit']) {
      const cfg = settings.hooks[event][0]
      expect(cfg.hooks[0].command).toBe(`node ${containerHook}`)
    }
  })

  it('seeds skipDangerousModePermissionPrompt: true so cloud agents do not re-prompt the bypass warning on every recreate', () => {
    const { settingsPath } = provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    expect(settings.skipDangerousModePermissionPrompt).toBe(true)
  })

  it('does not reference the host repo path in the generated settings', () => {
    const { settingsPath } = provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    const body = fs.readFileSync(settingsPath, 'utf8')
    expect(body).not.toContain(tmpRepo)
    expect(body).not.toContain(tmpHome)
  })

  it('creates the per-UUID dir if missing', () => {
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    expect(fs.existsSync(agentDir)).toBe(false)
    provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    expect(fs.existsSync(agentDir)).toBe(true)
  })

  it('seeds claude-home.json with valid empty JSON so docker-create finds a file (not auto-mat dir) at the bind target', () => {
    provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    const homeJsonPath = path.join(tmpHome, '.aimaestro', 'agents', uuid, 'claude-home.json')
    expect(fs.statSync(homeJsonPath).isFile()).toBe(true)
    expect(() => JSON.parse(fs.readFileSync(homeJsonPath, 'utf8'))).not.toThrow()
  })

  it('seeds claude-credentials.json with valid empty JSON', () => {
    provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    const credsPath = path.join(tmpHome, '.aimaestro', 'agents', uuid, 'claude-credentials.json')
    expect(fs.statSync(credsPath).isFile()).toBe(true)
    expect(() => JSON.parse(fs.readFileSync(credsPath, 'utf8'))).not.toThrow()
  })

  it('creates the gh-config directory for the gh auth bind mount', () => {
    provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    const ghDir = path.join(tmpHome, '.aimaestro', 'agents', uuid, 'gh-config')
    expect(fs.statSync(ghDir).isDirectory()).toBe(true)
  })

  it('preserves existing claude-home.json operator state across re-runs (state persistence intent)', () => {
    // Pre-seed with operator-set theme + state fields. Shape-aware merge
    // (kanban 406ff85d) MUST preserve all existing operator state.
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const homeJsonPath = path.join(agentDir, 'claude-home.json')
    const existing = '{"theme":"light","bypassPermissionsModeAccepted":true,"hasCompletedOnboarding":true}\n'
    fs.writeFileSync(homeJsonPath, existing)
    provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    // theme=light operator choice preserved; other fields untouched.
    const body = JSON.parse(fs.readFileSync(homeJsonPath, 'utf8'))
    expect(body.theme).toBe('light')
    expect(body.bypassPermissionsModeAccepted).toBe(true)
    expect(body.hasCompletedOnboarding).toBe(true)
  })

  // ── kanban 406ff85d: shape-aware merge regression coverage ─────────────
  // Sister fix to PR #112 (gemini-settings.json shape-aware staleness).
  // Pre-kanban-41dd54b9 claude-home.json files lacked theme — when
  // migrateAgentPersistence carried them forward, the bare existsSync guard
  // short-circuited and the theme=dark seed was never injected. Hale on
  // Holmes empirically hit this 2026-05-06.
  //
  // Critical methodology note (feedback_provisioning_seed_empirical_methodology.md):
  // these tests MUST exercise the migrate-then-existsSync path. Manual
  // rm-then-recreate is a false-positive trap — the bug only manifests when
  // the predecessor file ALREADY EXISTS but lacks the theme field.

  it('migrate-then-staleness path: stale claude-home.json without theme gets shape-aware injection', () => {
    // Simulate migrateAgentPersistence carry-forward: file exists but is
    // pre-kanban-41dd54b9 shape (no theme field).
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const homeJsonPath = path.join(agentDir, 'claude-home.json')
    const stale = '{"bypassPermissionsModeAccepted":true,"hasCompletedOnboarding":true}\n'
    fs.writeFileSync(homeJsonPath, stale)
    provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    const body = JSON.parse(fs.readFileSync(homeJsonPath, 'utf8'))
    // Missing theme injected, all other state preserved.
    expect(body.theme).toBe('dark')
    expect(body.bypassPermissionsModeAccepted).toBe(true)
    expect(body.hasCompletedOnboarding).toBe(true)
  })

  it('migrate-then-staleness path: empty {} claude-home.json gets theme injected', () => {
    // Degenerate-empty case: file exists, parses, but is just {}.
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const homeJsonPath = path.join(agentDir, 'claude-home.json')
    fs.writeFileSync(homeJsonPath, '{}\n')
    provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    const body = JSON.parse(fs.readFileSync(homeJsonPath, 'utf8'))
    expect(body.theme).toBe('dark')
  })

  it('unparseable claude-home.json re-seeds from scratch (defensive recovery)', () => {
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const homeJsonPath = path.join(agentDir, 'claude-home.json')
    fs.writeFileSync(homeJsonPath, 'not-valid-json{{{\n')
    provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    const body = JSON.parse(fs.readFileSync(homeJsonPath, 'utf8'))
    expect(body.theme).toBe('dark')
  })

  it('preserves existing claude-credentials.json content across re-runs (login persistence intent)', () => {
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const credsPath = path.join(agentDir, 'claude-credentials.json')
    const existing = '{"claudeAiOauth":{"accessToken":"sk-ant-oat01-stub"}}\n'
    fs.writeFileSync(credsPath, existing)
    provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    expect(fs.readFileSync(credsPath, 'utf8')).toBe(existing)
  })

  it('writes seeded persistence files with restrictive 0600 perms', () => {
    provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    const homeMode = fs.statSync(path.join(agentDir, 'claude-home.json')).mode & 0o777
    const credsMode = fs.statSync(path.join(agentDir, 'claude-credentials.json')).mode & 0o777
    expect(homeMode).toBe(0o600)
    expect(credsMode).toBe(0o600)
  })

  it('seeds claude-home.json with theme=dark so fresh-create agents skip the theme picker (kanban 41dd54b9)', () => {
    provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    const homeJsonPath = path.join(tmpHome, '.aimaestro', 'agents', uuid, 'claude-home.json')
    const body = JSON.parse(fs.readFileSync(homeJsonPath, 'utf8'))
    expect(body.theme).toBe('dark')
  })

  it('bootstraps claude-credentials.json from host ~/.claude/.credentials.json when present (kanban 8aa61a60 OAuth bootstrap)', () => {
    const hostClaudeDir = path.join(tmpHome, '.claude')
    fs.mkdirSync(hostClaudeDir, { recursive: true })
    fs.writeFileSync(path.join(hostClaudeDir, '.credentials.json'),
      '{"claudeAiOauth":{"accessToken":"sk-ant-oat01-host-bootstrapped"}}\n', { mode: 0o600 })
    provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    const credsPath = path.join(tmpHome, '.aimaestro', 'agents', uuid, 'claude-credentials.json')
    const body = JSON.parse(fs.readFileSync(credsPath, 'utf8'))
    expect(body.claudeAiOauth.accessToken).toBe('sk-ant-oat01-host-bootstrapped')
  })

  it('falls back to empty {} when host has no claude credentials (first-time setup case)', () => {
    // tmpHome is fresh; no host ~/.claude/.credentials.json
    provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)
    const credsPath = path.join(tmpHome, '.aimaestro', 'agents', uuid, 'claude-credentials.json')
    expect(JSON.parse(fs.readFileSync(credsPath, 'utf8'))).toEqual({})
  })

  it('re-bootstraps claude-credentials.json when migrated predecessor placeholder is empty {} and host now has creds (kanban 02a8ebda recreate-path, Watson Mason finding)', () => {
    // Simulate the recreate flow: migrateAgentPersistence has already copied
    // the predecessor's empty {} into the new UUID dir BEFORE provisioning runs.
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    fs.writeFileSync(path.join(agentDir, 'claude-credentials.json'), '{}\n', { mode: 0o600 })
    // Operator has since run claude /login on the host
    const hostClaudeDir = path.join(tmpHome, '.claude')
    fs.mkdirSync(hostClaudeDir, { recursive: true })
    fs.writeFileSync(path.join(hostClaudeDir, '.credentials.json'),
      '{"claudeAiOauth":{"accessToken":"sk-ant-oat01-post-hoc-login"}}\n', { mode: 0o600 })

    provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)

    const credsPath = path.join(agentDir, 'claude-credentials.json')
    const body = JSON.parse(fs.readFileSync(credsPath, 'utf8'))
    expect(body.claudeAiOauth.accessToken).toBe('sk-ant-oat01-post-hoc-login')
  })

  it('preserves real rotated claude-credentials at dest across re-runs even when host source has older content', () => {
    // Simulate a healthy long-running agent whose claude has rotated its OAuth.
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const rotated = '{"claudeAiOauth":{"accessToken":"sk-ant-oat01-rotated-by-agent","refreshToken":"r-r"}}\n'
    fs.writeFileSync(path.join(agentDir, 'claude-credentials.json'), rotated, { mode: 0o600 })
    const hostClaudeDir = path.join(tmpHome, '.claude')
    fs.mkdirSync(hostClaudeDir, { recursive: true })
    fs.writeFileSync(path.join(hostClaudeDir, '.credentials.json'),
      '{"claudeAiOauth":{"accessToken":"sk-ant-oat01-host-OLD"}}\n', { mode: 0o600 })

    provisionCloudClaudeConfig(uuid, tmpHome, tmpRepo)

    expect(fs.readFileSync(path.join(agentDir, 'claude-credentials.json'), 'utf8')).toBe(rotated)
  })
})

describe('provisionCloudGeminiConfig', () => {
  const uuid = '55555555-5555-5555-5555-555555555555'
  let tmpHome: string

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-gem-'))
  })

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it('writes gemini-settings.json with general.enableAutoUpdate=false to suppress self-update fetch (kanban cd2d7377)', () => {
    const { settingsPath } = provisionCloudGeminiConfig(uuid, tmpHome)
    expect(settingsPath).toBe(path.join(tmpHome, '.aimaestro', 'agents', uuid, 'gemini-settings.json'))
    const body = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    expect(body.general.enableAutoUpdate).toBe(false)
  })

  it('writes gemini-settings.json with security.auth.selectedType="oauth-personal" to skip the auth picker (kanban 1f911653 Hardin empirical)', () => {
    const { settingsPath } = provisionCloudGeminiConfig(uuid, tmpHome)
    const body = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    expect(body.security.auth.selectedType).toBe('oauth-personal')
  })

  it('seeds the file with restrictive 0600 perms', () => {
    const { settingsPath } = provisionCloudGeminiConfig(uuid, tmpHome)
    expect(fs.statSync(settingsPath).mode & 0o777).toBe(0o600)
  })

  it('creates the per-UUID dir if missing', () => {
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    expect(fs.existsSync(agentDir)).toBe(false)
    provisionCloudGeminiConfig(uuid, tmpHome)
    expect(fs.existsSync(agentDir)).toBe(true)
  })

  it('preserves existing gemini-settings.json content across re-runs (operator hand-edit intent)', () => {
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const settingsPath = path.join(agentDir, 'gemini-settings.json')
    // Fixture includes security.auth.selectedType so the staleness guard
    // (kanban 61aac9db) treats it as already-shaped and the byte-equal
    // preservation contract holds. Without selectedType, the guard would
    // inject the missing field and rewrite — exercised by the staleness
    // tests below.
    const existing = '{"general":{"enableAutoUpdate":true,"customField":"keep-me"},"security":{"auth":{"selectedType":"oauth-personal"}}}\n'
    fs.writeFileSync(settingsPath, existing)
    provisionCloudGeminiConfig(uuid, tmpHome)
    expect(fs.readFileSync(settingsPath, 'utf8')).toBe(existing)
  })

  it('re-seeds gemini-settings.json by injecting security.auth.selectedType when migrated predecessor lacks the field (kanban 61aac9db stale-shape signal, sister-class to PR #104 empty-{} re-bootstrap)', () => {
    // Simulate the /recreate flow: migrateAgentPersistence has copied the
    // predecessor's pre-PR-#108 gemini-settings.json (which lacks
    // security.auth.selectedType) into the new UUID dir BEFORE provisioning
    // runs. Without the staleness guard, the existsSync check short-circuits
    // and the picker-bypass field never gets injected.
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const settingsPath = path.join(agentDir, 'gemini-settings.json')
    fs.writeFileSync(settingsPath, '{"general":{"enableAutoUpdate":false}}\n', { mode: 0o600 })

    provisionCloudGeminiConfig(uuid, tmpHome)

    const body = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    expect(body.general.enableAutoUpdate).toBe(false) // pre-existing field preserved
    expect(body.security.auth.selectedType).toBe('oauth-personal') // missing field injected
  })

  it('preserves operator hand-edits to OTHER fields when injecting missing security.auth.selectedType (Option D minimal-merge contract)', () => {
    // Stale-shape file PLUS operator hand-edits (custom keys, mcp section
    // unrelated to auth). Staleness guard must inject ONLY the missing
    // selectedType — operator additions to other parts of the file survive.
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const settingsPath = path.join(agentDir, 'gemini-settings.json')
    const handEdited = JSON.stringify({
      general: { enableAutoUpdate: true, customField: 'operator-set' },
      mcp: { servers: [{ name: 'op-tool', url: 'http://x' }] },
    })
    fs.writeFileSync(settingsPath, handEdited + '\n', { mode: 0o600 })

    provisionCloudGeminiConfig(uuid, tmpHome)

    const body = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    // Operator value preserved (operator turned auto-update back on, even though seed default is false).
    expect(body.general.enableAutoUpdate).toBe(true)
    // Operator-added top-level field preserved.
    expect(body.general.customField).toBe('operator-set')
    // Operator-added top-level section preserved.
    expect(body.mcp.servers).toEqual([{ name: 'op-tool', url: 'http://x' }])
    // Missing field injected.
    expect(body.security.auth.selectedType).toBe('oauth-personal')
  })

  it('falls back to a fresh seed when gemini-settings.json is unparseable (defensive corner case, kanban 61aac9db)', () => {
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const settingsPath = path.join(agentDir, 'gemini-settings.json')
    fs.writeFileSync(settingsPath, '{ this is not json', { mode: 0o600 })

    provisionCloudGeminiConfig(uuid, tmpHome)

    const body = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    expect(body.general.enableAutoUpdate).toBe(false)
    expect(body.security.auth.selectedType).toBe('oauth-personal')
  })

  it('preserves operator-set non-default selectedType (e.g. "gemini-api-key") — operator choice wins (Watson polish)', () => {
    // Operator may legitimately choose a non-OAuth auth method (gemini-api-key,
    // vertex-ai, etc.). Staleness guard must NOT overwrite operator selection
    // — only inject when selectedType is missing or non-string.
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const settingsPath = path.join(agentDir, 'gemini-settings.json')
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        general: { enableAutoUpdate: false },
        security: { auth: { selectedType: 'gemini-api-key' } },
      }) + '\n',
      { mode: 0o600 },
    )

    provisionCloudGeminiConfig(uuid, tmpHome)

    const body = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    expect(body.security.auth.selectedType).toBe('gemini-api-key') // operator choice wins
  })

  it('tolerates non-object security or security.auth values (defensive coercion, Watson polish)', () => {
    // If a corrupted/legacy settings.json has security set to a string (or
    // any non-object), the spread {...security} would inline string indices
    // and break gemini. Defensive coercion treats malformed shapes as empty.
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const settingsPath = path.join(agentDir, 'gemini-settings.json')
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        general: { enableAutoUpdate: false },
        security: 'corrupted-string-not-object',
      }) + '\n',
      { mode: 0o600 },
    )

    provisionCloudGeminiConfig(uuid, tmpHome)

    const body = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    expect(body.general.enableAutoUpdate).toBe(false)
    // security replaced with a clean object; selectedType injected.
    expect(typeof body.security).toBe('object')
    expect(Array.isArray(body.security)).toBe(false)
    expect(body.security.auth.selectedType).toBe('oauth-personal')
    // No string-index leakage from the spread — count keys at the top level
    // of body.security to ensure only "auth" is present, not "0", "1", ...
    expect(Object.keys(body.security)).toEqual(['auth'])
  })
})

describe('provisionCloudCodexConfig', () => {
  const uuid = '66666666-6666-6666-6666-666666666666'
  let tmpHome: string

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-codex-'))
  })

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it('writes codex-version.json with dismissed_version sentinel suppressing the update modal (kanban 22f4af86)', () => {
    const { versionPath } = provisionCloudCodexConfig(uuid, tmpHome)
    expect(versionPath).toBe(path.join(tmpHome, '.aimaestro', 'agents', uuid, 'codex-version.json'))
    const body = JSON.parse(fs.readFileSync(versionPath, 'utf8'))
    expect(body.dismissed_version).toBe('999.0.0')
    expect(body.latest_version).toBe('999.0.0')
  })

  it('seeds the file with restrictive 0600 perms', () => {
    const { versionPath } = provisionCloudCodexConfig(uuid, tmpHome)
    expect(fs.statSync(versionPath).mode & 0o777).toBe(0o600)
  })

  it('creates the per-UUID dir if missing', () => {
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    expect(fs.existsSync(agentDir)).toBe(false)
    provisionCloudCodexConfig(uuid, tmpHome)
    expect(fs.existsSync(agentDir)).toBe(true)
  })

  it('preserves existing codex-version.json content across re-runs (operator override intent)', () => {
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const versionPath = path.join(agentDir, 'codex-version.json')
    const existing = '{"latest_version":"0.130.0","last_checked_at":"2026-05-15T00:00:00Z","dismissed_version":"0.130.0"}\n'
    fs.writeFileSync(versionPath, existing)
    provisionCloudCodexConfig(uuid, tmpHome)
    expect(fs.readFileSync(versionPath, 'utf8')).toBe(existing)
  })

  it('writes codex-config.toml pre-trusting /workspace so codex skips the trust modal on first launch (kanban 354a5174 trust-modal sibling)', () => {
    const { configTomlPath } = provisionCloudCodexConfig(uuid, tmpHome)
    expect(configTomlPath).toBe(path.join(tmpHome, '.aimaestro', 'agents', uuid, 'codex-config.toml'))
    const body = fs.readFileSync(configTomlPath, 'utf8')
    expect(body).toContain('[projects."/workspace"]')
    expect(body).toContain('trust_level = "trusted"')
  })

  it('seeds config.toml with restrictive 0600 perms', () => {
    const { configTomlPath } = provisionCloudCodexConfig(uuid, tmpHome)
    expect(fs.statSync(configTomlPath).mode & 0o777).toBe(0o600)
  })

  it('preserves existing codex-config.toml across re-runs (operator hand-edit intent)', () => {
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const configTomlPath = path.join(agentDir, 'codex-config.toml')
    const existing = '[projects."/workspace"]\ntrust_level = "trusted"\n\n[other]\nfoo = "bar"\n'
    fs.writeFileSync(configTomlPath, existing)
    provisionCloudCodexConfig(uuid, tmpHome)
    expect(fs.readFileSync(configTomlPath, 'utf8')).toBe(existing)
  })
})

describe('buildCloudCodexConfigTomlMount', () => {
  it('returns a file-level bind mount for /home/claude/.codex/config.toml', () => {
    const uuid = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    const home = '/home/operator'
    const m = buildCloudCodexConfigTomlMount(uuid, home)
    expect(m.hostPath).toBe(`/home/operator/.aimaestro/agents/${uuid}/codex-config.toml`)
    expect(m.containerPath).toBe('/home/claude/.codex/config.toml')
    expect(m.readOnly).toBeUndefined()
  })

  it('passes validateMounts so the mount is shellable in a docker -v flag', () => {
    const uuid = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    const home = '/home/operator'
    expect(validateMounts([buildCloudCodexConfigTomlMount(uuid, home)])).toBeNull()
  })
})

describe('buildCloudGeminiSettingsMount', () => {
  it('returns a file-level bind mount for /home/claude/.gemini/settings.json', () => {
    const uuid = '77777777-aaaa-7777-aaaa-777777777777'
    const home = '/home/operator'
    const m = buildCloudGeminiSettingsMount(uuid, home)
    expect(m.hostPath).toBe(`/home/operator/.aimaestro/agents/${uuid}/gemini-settings.json`)
    expect(m.containerPath).toBe('/home/claude/.gemini/settings.json')
    expect(m.readOnly).toBeUndefined()
  })

  it('passes validateMounts so the mount is shellable in a docker -v flag', () => {
    const uuid = '77777777-aaaa-7777-aaaa-777777777777'
    const home = '/home/operator'
    expect(validateMounts([buildCloudGeminiSettingsMount(uuid, home)])).toBeNull()
  })
})

describe('buildCloudCodexVersionMount', () => {
  it('returns a file-level bind mount for /home/claude/.codex/version.json', () => {
    const uuid = '88888888-bbbb-8888-bbbb-888888888888'
    const home = '/home/operator'
    const m = buildCloudCodexVersionMount(uuid, home)
    expect(m.hostPath).toBe(`/home/operator/.aimaestro/agents/${uuid}/codex-version.json`)
    expect(m.containerPath).toBe('/home/claude/.codex/version.json')
    expect(m.readOnly).toBeUndefined()
  })

  it('passes validateMounts so the mount is shellable in a docker -v flag', () => {
    const uuid = '88888888-bbbb-8888-bbbb-888888888888'
    const home = '/home/operator'
    expect(validateMounts([buildCloudCodexVersionMount(uuid, home)])).toBeNull()
  })
})

describe('seedFromHostFile', () => {
  let tmpHome: string

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-seed-'))
  })

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it('returns true and copies content when source exists and dest is missing', () => {
    const src = path.join(tmpHome, 'src.json')
    const dst = path.join(tmpHome, 'dst.json')
    fs.writeFileSync(src, '{"hostFile":"hello"}\n')
    expect(seedFromHostFile(src, dst)).toBe(true)
    expect(JSON.parse(fs.readFileSync(dst, 'utf8')).hostFile).toBe('hello')
  })

  it('writes the destination with restrictive 0600 perms', () => {
    const src = path.join(tmpHome, 'src.json')
    const dst = path.join(tmpHome, 'dst.json')
    fs.writeFileSync(src, '{}\n')
    seedFromHostFile(src, dst)
    expect(fs.statSync(dst).mode & 0o777).toBe(0o600)
  })

  it('returns false and does not overwrite when dest already exists (operator hand-edit / pre-seeded)', () => {
    const src = path.join(tmpHome, 'src.json')
    const dst = path.join(tmpHome, 'dst.json')
    fs.writeFileSync(src, '{"new":"value"}\n')
    fs.writeFileSync(dst, '{"existing":"value"}\n')
    expect(seedFromHostFile(src, dst)).toBe(false)
    expect(fs.readFileSync(dst, 'utf8')).toBe('{"existing":"value"}\n')
  })

  it('returns false when source is missing (operator has not run cli login yet)', () => {
    const src = path.join(tmpHome, 'absent.json')
    const dst = path.join(tmpHome, 'dst.json')
    expect(seedFromHostFile(src, dst)).toBe(false)
    expect(fs.existsSync(dst)).toBe(false)
  })

  it('re-bootstraps when dest holds the empty {} placeholder and host source becomes available (kanban 02a8ebda — post-hoc host login propagates on recreate)', () => {
    const src = path.join(tmpHome, 'src.json')
    const dst = path.join(tmpHome, 'dst.json')
    fs.writeFileSync(src, '{"OPENAI_API_KEY":"sk-host-real"}\n')
    fs.writeFileSync(dst, '{}\n')
    expect(seedFromHostFile(src, dst)).toBe(true)
    const body = JSON.parse(fs.readFileSync(dst, 'utf8'))
    expect(body.OPENAI_API_KEY).toBe('sk-host-real')
  })

  it('re-bootstraps when dest is bare empty string (defensive against zero-byte placeholder writes)', () => {
    const src = path.join(tmpHome, 'src.json')
    const dst = path.join(tmpHome, 'dst.json')
    fs.writeFileSync(src, '{"claudeAiOauth":{"accessToken":"sk-ant-host"}}\n')
    fs.writeFileSync(dst, '')
    expect(seedFromHostFile(src, dst)).toBe(true)
    const body = JSON.parse(fs.readFileSync(dst, 'utf8'))
    expect(body.claudeAiOauth.accessToken).toBe('sk-ant-host')
  })

  it('preserves real rotated credentials at dest even when host source has older content (per-agent rotation independence)', () => {
    const src = path.join(tmpHome, 'src.json')
    const dst = path.join(tmpHome, 'dst.json')
    fs.writeFileSync(src, '{"OPENAI_API_KEY":"sk-host-old"}\n')
    fs.writeFileSync(dst, '{"OPENAI_API_KEY":"sk-rotated-by-agent","tokens":{"refresh":"r-rot"}}\n')
    expect(seedFromHostFile(src, dst)).toBe(false)
    const body = JSON.parse(fs.readFileSync(dst, 'utf8'))
    expect(body.OPENAI_API_KEY).toBe('sk-rotated-by-agent')
    expect(body.tokens.refresh).toBe('r-rot')
  })
})

describe('provisionCloudCodexAuth', () => {
  const uuid = '99999999-9999-9999-9999-999999999999'
  let tmpHome: string

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-codex-auth-'))
  })

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it('bootstraps codex-auth.json from host ~/.codex/auth.json when present (kanban 354a5174 Option A)', () => {
    const hostCodexDir = path.join(tmpHome, '.codex')
    fs.mkdirSync(hostCodexDir, { recursive: true })
    fs.writeFileSync(path.join(hostCodexDir, 'auth.json'),
      '{"OPENAI_API_KEY":"sk-test-from-host","tokens":{"access":"abc"}}\n', { mode: 0o600 })

    const { authPath, bootstrapped } = provisionCloudCodexAuth(uuid, tmpHome)
    expect(authPath).toBe(path.join(tmpHome, '.aimaestro', 'agents', uuid, 'codex-auth.json'))
    expect(bootstrapped).toBe(true)
    const body = JSON.parse(fs.readFileSync(authPath, 'utf8'))
    expect(body.OPENAI_API_KEY).toBe('sk-test-from-host')
    expect(body.tokens.access).toBe('abc')
  })

  it('seeds empty {} when host has no auth.json (first-time setup case)', () => {
    const { authPath, bootstrapped } = provisionCloudCodexAuth(uuid, tmpHome)
    expect(bootstrapped).toBe(false)
    expect(JSON.parse(fs.readFileSync(authPath, 'utf8'))).toEqual({})
  })

  it('writes the seeded file with restrictive 0600 perms', () => {
    const { authPath } = provisionCloudCodexAuth(uuid, tmpHome)
    expect(fs.statSync(authPath).mode & 0o777).toBe(0o600)
  })

  it('preserves existing per-agent codex-auth.json across re-runs (per-agent rotation independence)', () => {
    const hostCodexDir = path.join(tmpHome, '.codex')
    fs.mkdirSync(hostCodexDir, { recursive: true })
    fs.writeFileSync(path.join(hostCodexDir, 'auth.json'),
      '{"OPENAI_API_KEY":"sk-host-NEW"}\n', { mode: 0o600 })
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const authPath = path.join(agentDir, 'codex-auth.json')
    const existing = '{"OPENAI_API_KEY":"sk-rotated-by-codex-runtime"}\n'
    fs.writeFileSync(authPath, existing)
    const result = provisionCloudCodexAuth(uuid, tmpHome)
    expect(result.bootstrapped).toBe(false)
    expect(fs.readFileSync(authPath, 'utf8')).toBe(existing)
  })

  it('creates the per-UUID dir if missing', () => {
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    expect(fs.existsSync(agentDir)).toBe(false)
    provisionCloudCodexAuth(uuid, tmpHome)
    expect(fs.existsSync(agentDir)).toBe(true)
  })

  it('re-bootstraps codex-auth.json when migrated predecessor placeholder is empty {} and host now has auth (kanban 02a8ebda recreate-path)', () => {
    // Simulate the /recreate flow: migrateAgentPersistence has copied the
    // predecessor's empty {} into the new UUID dir BEFORE provisioning runs.
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    fs.writeFileSync(path.join(agentDir, 'codex-auth.json'), '{}\n', { mode: 0o600 })
    const hostCodexDir = path.join(tmpHome, '.codex')
    fs.mkdirSync(hostCodexDir, { recursive: true })
    fs.writeFileSync(path.join(hostCodexDir, 'auth.json'),
      '{"OPENAI_API_KEY":"sk-host-post-hoc-login"}\n', { mode: 0o600 })

    const result = provisionCloudCodexAuth(uuid, tmpHome)

    expect(result.bootstrapped).toBe(true)
    const body = JSON.parse(fs.readFileSync(result.authPath, 'utf8'))
    expect(body.OPENAI_API_KEY).toBe('sk-host-post-hoc-login')
  })

  it('preserves real rotated codex-auth across re-runs even when migrated empty placeholder would not block (rotation independence)', () => {
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const rotated = '{"OPENAI_API_KEY":"sk-rotated-by-codex","tokens":{"refresh":"r-r"}}\n'
    fs.writeFileSync(path.join(agentDir, 'codex-auth.json'), rotated, { mode: 0o600 })
    const hostCodexDir = path.join(tmpHome, '.codex')
    fs.mkdirSync(hostCodexDir, { recursive: true })
    fs.writeFileSync(path.join(hostCodexDir, 'auth.json'),
      '{"OPENAI_API_KEY":"sk-host-OLD"}\n', { mode: 0o600 })

    const result = provisionCloudCodexAuth(uuid, tmpHome)

    expect(result.bootstrapped).toBe(false)
    expect(fs.readFileSync(result.authPath, 'utf8')).toBe(rotated)
  })
})

describe('buildCloudCodexAuthMount', () => {
  it('returns a file-level bind mount for /home/claude/.codex/auth.json', () => {
    const uuid = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const home = '/home/operator'
    const m = buildCloudCodexAuthMount(uuid, home)
    expect(m.hostPath).toBe(`/home/operator/.aimaestro/agents/${uuid}/codex-auth.json`)
    expect(m.containerPath).toBe('/home/claude/.codex/auth.json')
    expect(m.readOnly).toBeUndefined()
  })

  it('passes validateMounts so the mount is shellable in a docker -v flag', () => {
    const uuid = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const home = '/home/operator'
    expect(validateMounts([buildCloudCodexAuthMount(uuid, home)])).toBeNull()
  })
})

describe('provisionCloudGeminiAuth', () => {
  const uuid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  let tmpHome: string

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-gemini-auth-'))
  })

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it('bootstraps gemini-oauth-creds.json from host ~/.gemini/oauth_creds.json when present (kanban 1f911653 Option A)', () => {
    const hostGeminiDir = path.join(tmpHome, '.gemini')
    fs.mkdirSync(hostGeminiDir, { recursive: true })
    fs.writeFileSync(path.join(hostGeminiDir, 'oauth_creds.json'),
      '{"access_token":"ya29.host","refresh_token":"r-host","token_type":"Bearer"}\n', { mode: 0o600 })

    const { authPath, bootstrapped } = provisionCloudGeminiAuth(uuid, tmpHome)
    expect(authPath).toBe(path.join(tmpHome, '.aimaestro', 'agents', uuid, 'gemini-oauth-creds.json'))
    expect(bootstrapped).toBe(true)
    const body = JSON.parse(fs.readFileSync(authPath, 'utf8'))
    expect(body.access_token).toBe('ya29.host')
    expect(body.refresh_token).toBe('r-host')
    expect(body.token_type).toBe('Bearer')
  })

  it('seeds empty {} when host has no oauth_creds.json (first-time setup case)', () => {
    const { authPath, bootstrapped } = provisionCloudGeminiAuth(uuid, tmpHome)
    expect(bootstrapped).toBe(false)
    expect(JSON.parse(fs.readFileSync(authPath, 'utf8'))).toEqual({})
  })

  it('writes the seeded file with restrictive 0600 perms', () => {
    const { authPath } = provisionCloudGeminiAuth(uuid, tmpHome)
    expect(fs.statSync(authPath).mode & 0o777).toBe(0o600)
  })

  it('preserves existing per-agent gemini-oauth-creds.json across re-runs (per-agent rotation independence)', () => {
    const hostGeminiDir = path.join(tmpHome, '.gemini')
    fs.mkdirSync(hostGeminiDir, { recursive: true })
    fs.writeFileSync(path.join(hostGeminiDir, 'oauth_creds.json'),
      '{"access_token":"ya29.host-NEW"}\n', { mode: 0o600 })
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const authPath = path.join(agentDir, 'gemini-oauth-creds.json')
    const existing = '{"access_token":"ya29.rotated-by-gemini-runtime"}\n'
    fs.writeFileSync(authPath, existing)
    const result = provisionCloudGeminiAuth(uuid, tmpHome)
    expect(result.bootstrapped).toBe(false)
    expect(fs.readFileSync(authPath, 'utf8')).toBe(existing)
  })

  it('creates the per-UUID dir if missing', () => {
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    expect(fs.existsSync(agentDir)).toBe(false)
    provisionCloudGeminiAuth(uuid, tmpHome)
    expect(fs.existsSync(agentDir)).toBe(true)
  })

  it('re-bootstraps gemini-oauth-creds.json when migrated predecessor placeholder is empty {} and host now has creds (kanban 02a8ebda recreate-path)', () => {
    // Simulate the /recreate flow: migrateAgentPersistence has copied the
    // predecessor's empty {} into the new UUID dir BEFORE provisioning runs.
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    fs.writeFileSync(path.join(agentDir, 'gemini-oauth-creds.json'), '{}\n', { mode: 0o600 })
    const hostGeminiDir = path.join(tmpHome, '.gemini')
    fs.mkdirSync(hostGeminiDir, { recursive: true })
    fs.writeFileSync(path.join(hostGeminiDir, 'oauth_creds.json'),
      '{"access_token":"ya29.host-post-hoc-login"}\n', { mode: 0o600 })

    const result = provisionCloudGeminiAuth(uuid, tmpHome)

    expect(result.bootstrapped).toBe(true)
    const body = JSON.parse(fs.readFileSync(result.authPath, 'utf8'))
    expect(body.access_token).toBe('ya29.host-post-hoc-login')
  })

  it('preserves real rotated gemini-oauth-creds across re-runs even when migrated empty placeholder would not block (rotation independence)', () => {
    const agentDir = path.join(tmpHome, '.aimaestro', 'agents', uuid)
    fs.mkdirSync(agentDir, { recursive: true })
    const rotated = '{"access_token":"ya29.rotated-by-gemini","refresh_token":"r-r"}\n'
    fs.writeFileSync(path.join(agentDir, 'gemini-oauth-creds.json'), rotated, { mode: 0o600 })
    const hostGeminiDir = path.join(tmpHome, '.gemini')
    fs.mkdirSync(hostGeminiDir, { recursive: true })
    fs.writeFileSync(path.join(hostGeminiDir, 'oauth_creds.json'),
      '{"access_token":"ya29.host-OLD"}\n', { mode: 0o600 })

    const result = provisionCloudGeminiAuth(uuid, tmpHome)

    expect(result.bootstrapped).toBe(false)
    expect(fs.readFileSync(result.authPath, 'utf8')).toBe(rotated)
  })
})

describe('buildCloudGeminiOAuthMount', () => {
  it('returns a file-level bind mount for /home/claude/.gemini/oauth_creds.json', () => {
    const uuid = 'gggggggg-gggg-gggg-gggg-gggggggggggg'
    const home = '/home/operator'
    const m = buildCloudGeminiOAuthMount(uuid, home)
    expect(m.hostPath).toBe(`/home/operator/.aimaestro/agents/${uuid}/gemini-oauth-creds.json`)
    expect(m.containerPath).toBe('/home/claude/.gemini/oauth_creds.json')
    expect(m.readOnly).toBeUndefined()
  })

  it('passes validateMounts so the mount is shellable in a docker -v flag', () => {
    const uuid = 'gggggggg-gggg-gggg-gggg-gggggggggggg'
    const home = '/home/operator'
    expect(validateMounts([buildCloudGeminiOAuthMount(uuid, home)])).toBeNull()
  })
})

describe('migrateAgentPersistence', () => {
  let tmpHome: string
  const fromId = '77777777-7777-7777-7777-777777777777'
  const toId = '88888888-8888-8888-8888-888888888888'

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-mig-'))
    const fromDir = path.join(tmpHome, '.aimaestro', 'agents', fromId)
    fs.mkdirSync(path.join(fromDir, 'gh-config'), { recursive: true })
    fs.writeFileSync(path.join(fromDir, 'claude-home.json'),
      '{"hasCompletedOnboarding":true,"projects":{"/workspace":{"hasTrustDialogAccepted":true}}}\n', { mode: 0o600 })
    fs.writeFileSync(path.join(fromDir, 'claude-credentials.json'),
      '{"claudeAiOauth":{"accessToken":"sk-ant-oat01-from-pred"}}\n', { mode: 0o600 })
    fs.writeFileSync(path.join(fromDir, 'gh-config', 'hosts.yml'),
      'github.com:\n    user: test\n', { mode: 0o600 })
    fs.writeFileSync(path.join(fromDir, 'gemini-settings.json'),
      '{"general":{"enableAutoUpdate":false,"customField":"keep-me"}}\n', { mode: 0o600 })
    fs.writeFileSync(path.join(fromDir, 'codex-version.json'),
      '{"latest_version":"0.130.0","last_checked_at":"2026-05-15T00:00:00Z","dismissed_version":"0.130.0"}\n', { mode: 0o600 })
    fs.writeFileSync(path.join(fromDir, 'codex-auth.json'),
      '{"OPENAI_API_KEY":"sk-rotated-by-codex","tokens":{"refresh":"r-pred"}}\n', { mode: 0o600 })
    fs.writeFileSync(path.join(fromDir, 'codex-config.toml'),
      '[projects."/workspace"]\ntrust_level = "trusted"\n', { mode: 0o600 })
    fs.writeFileSync(path.join(fromDir, 'gemini-oauth-creds.json'),
      '{"access_token":"ya29.rotated-by-gemini","refresh_token":"r-pred","token_type":"Bearer"}\n', { mode: 0o600 })
    // PR #130 (kanban 2853e62d) directory mounts — chat history + hook state
    // that must carry forward on /recreate with persistFromAgentId.
    fs.mkdirSync(path.join(fromDir, 'claude-projects', '-workspace'), { recursive: true })
    fs.writeFileSync(path.join(fromDir, 'claude-projects', '-workspace', 'pred-session.jsonl'),
      '{"type":"user","message":{"content":"history from predecessor"},"timestamp":"2026-05-11T00:00:00Z"}\n', { mode: 0o600 })
    fs.mkdirSync(path.join(fromDir, 'chat-state'), { recursive: true })
    fs.writeFileSync(path.join(fromDir, 'chat-state', 'abc123def456.json'),
      '{"status":"waiting_for_input","updatedAt":"2026-05-11T00:00:00Z"}\n', { mode: 0o600 })
    // PR #132 (kanban d937c33d) gemini-chats sister mount — same survival
    // semantic as claude-projects but for cloud-Gemini transcript files.
    fs.mkdirSync(path.join(fromDir, 'gemini-chats'), { recursive: true })
    fs.writeFileSync(path.join(fromDir, 'gemini-chats', 'session-2026-05-11-abc12345.jsonl'),
      '{"id":"evt-1","type":"user","content":[{"text":"history from gemini predecessor"}],"timestamp":"2026-05-11T00:00:00Z"}\n', { mode: 0o600 })
  })

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it('copies claude-home.json content from predecessor', () => {
    migrateAgentPersistence(fromId, toId, tmpHome)
    const dst = path.join(tmpHome, '.aimaestro', 'agents', toId, 'claude-home.json')
    const body = JSON.parse(fs.readFileSync(dst, 'utf8'))
    expect(body.hasCompletedOnboarding).toBe(true)
    expect(body.projects['/workspace'].hasTrustDialogAccepted).toBe(true)
  })

  it('copies claude-credentials.json content from predecessor', () => {
    migrateAgentPersistence(fromId, toId, tmpHome)
    const dst = path.join(tmpHome, '.aimaestro', 'agents', toId, 'claude-credentials.json')
    const body = JSON.parse(fs.readFileSync(dst, 'utf8'))
    expect(body.claudeAiOauth.accessToken).toBe('sk-ant-oat01-from-pred')
  })

  it('migrates gh-config recursively (hosts.yml etc.)', () => {
    migrateAgentPersistence(fromId, toId, tmpHome)
    const dst = path.join(tmpHome, '.aimaestro', 'agents', toId, 'gh-config', 'hosts.yml')
    expect(fs.existsSync(dst)).toBe(true)
    expect(fs.readFileSync(dst, 'utf8')).toContain('github.com:')
  })

  it('migrates claude-projects/ recursively so chat history survives recreate-with-persistFromAgentId (kanban bf012c03)', () => {
    // PR #130 added claude-projects/ as a per-agent bind-mount source; without
    // the dirAssets extension to migrateAgentPersistence, /recreate with
    // persistFromAgentId would land the new UUID on an empty claude-projects/
    // and the operator's chat history would reset to "0 messages" in the
    // chat panel despite the auth and onboarding state surviving.
    migrateAgentPersistence(fromId, toId, tmpHome)
    const dst = path.join(tmpHome, '.aimaestro', 'agents', toId, 'claude-projects', '-workspace', 'pred-session.jsonl')
    expect(fs.existsSync(dst)).toBe(true)
    expect(fs.readFileSync(dst, 'utf8')).toContain('history from predecessor')
  })

  it('migrates chat-state/ recursively so hook output survives recreate-with-persistFromAgentId (kanban bf012c03)', () => {
    // Same shape as claude-projects, for the ai-maestro hook output —
    // permission-prompts + pending-state pinned by the most recent hook write
    // would otherwise reset to empty on every recreate.
    migrateAgentPersistence(fromId, toId, tmpHome)
    const dst = path.join(tmpHome, '.aimaestro', 'agents', toId, 'chat-state', 'abc123def456.json')
    expect(fs.existsSync(dst)).toBe(true)
    const body = JSON.parse(fs.readFileSync(dst, 'utf8'))
    expect(body.status).toBe('waiting_for_input')
  })

  it('migrates gemini-chats/ recursively so cloud-Gemini transcripts survive recreate-with-persistFromAgentId (kanban d937c33d closes-the-loop)', () => {
    // Sister to claude-projects for the Gemini per-project chats dir.
    // Without this, recreating a cloud-Gemini agent (Mason/Optic) with
    // persistFromAgentId resets the chat panel to "0 messages" the same
    // way PR #131 fixed for cloud-Claude agents.
    migrateAgentPersistence(fromId, toId, tmpHome)
    const dst = path.join(tmpHome, '.aimaestro', 'agents', toId, 'gemini-chats', 'session-2026-05-11-abc12345.jsonl')
    expect(fs.existsSync(dst)).toBe(true)
    expect(fs.readFileSync(dst, 'utf8')).toContain('history from gemini predecessor')
  })

  it('preserves restrictive 0600 mode on copied JSON files', () => {
    migrateAgentPersistence(fromId, toId, tmpHome)
    const home = path.join(tmpHome, '.aimaestro', 'agents', toId, 'claude-home.json')
    const creds = path.join(tmpHome, '.aimaestro', 'agents', toId, 'claude-credentials.json')
    expect(fs.statSync(home).mode & 0o777).toBe(0o600)
    expect(fs.statSync(creds).mode & 0o777).toBe(0o600)
  })

  it('copies gemini-settings.json content from predecessor (kanban cd2d7377 carry-forward)', () => {
    migrateAgentPersistence(fromId, toId, tmpHome)
    const dst = path.join(tmpHome, '.aimaestro', 'agents', toId, 'gemini-settings.json')
    const body = JSON.parse(fs.readFileSync(dst, 'utf8'))
    expect(body.general.enableAutoUpdate).toBe(false)
    expect(body.general.customField).toBe('keep-me')
    expect(fs.statSync(dst).mode & 0o777).toBe(0o600)
  })

  it('copies codex-version.json content from predecessor (kanban 22f4af86 carry-forward)', () => {
    migrateAgentPersistence(fromId, toId, tmpHome)
    const dst = path.join(tmpHome, '.aimaestro', 'agents', toId, 'codex-version.json')
    const body = JSON.parse(fs.readFileSync(dst, 'utf8'))
    expect(body.dismissed_version).toBe('0.130.0')
    expect(body.latest_version).toBe('0.130.0')
    expect(fs.statSync(dst).mode & 0o777).toBe(0o600)
  })

  it('copies codex-auth.json content from predecessor (kanban 354a5174 carry-forward across UUID rotation)', () => {
    migrateAgentPersistence(fromId, toId, tmpHome)
    const dst = path.join(tmpHome, '.aimaestro', 'agents', toId, 'codex-auth.json')
    const body = JSON.parse(fs.readFileSync(dst, 'utf8'))
    expect(body.OPENAI_API_KEY).toBe('sk-rotated-by-codex')
    expect(body.tokens.refresh).toBe('r-pred')
    expect(fs.statSync(dst).mode & 0o777).toBe(0o600)
  })

  it('copies codex-config.toml content from predecessor (trust modal seed survives recreate)', () => {
    migrateAgentPersistence(fromId, toId, tmpHome)
    const dst = path.join(tmpHome, '.aimaestro', 'agents', toId, 'codex-config.toml')
    const body = fs.readFileSync(dst, 'utf8')
    expect(body).toContain('[projects."/workspace"]')
    expect(body).toContain('trust_level = "trusted"')
    expect(fs.statSync(dst).mode & 0o777).toBe(0o600)
  })

  it('copies gemini-oauth-creds.json content from predecessor (kanban 1f911653 carry-forward across UUID rotation)', () => {
    migrateAgentPersistence(fromId, toId, tmpHome)
    const dst = path.join(tmpHome, '.aimaestro', 'agents', toId, 'gemini-oauth-creds.json')
    const body = JSON.parse(fs.readFileSync(dst, 'utf8'))
    expect(body.access_token).toBe('ya29.rotated-by-gemini')
    expect(body.refresh_token).toBe('r-pred')
    expect(fs.statSync(dst).mode & 0o777).toBe(0o600)
  })

  it('no-ops when fromAgentId is empty', () => {
    migrateAgentPersistence('', toId, tmpHome)
    const dst = path.join(tmpHome, '.aimaestro', 'agents', toId)
    expect(fs.existsSync(dst)).toBe(false)
  })

  it('no-ops when fromAgentId equals toAgentId', () => {
    expect(() => migrateAgentPersistence(fromId, fromId, tmpHome)).not.toThrow()
    // Source files unchanged
    const home = path.join(tmpHome, '.aimaestro', 'agents', fromId, 'claude-home.json')
    expect(fs.readFileSync(home, 'utf8')).toContain('hasCompletedOnboarding')
  })

  it('no-ops gracefully when predecessor dir is absent (legacy agent recreate)', () => {
    expect(() => migrateAgentPersistence('00000000-0000-0000-0000-000000000000', toId, tmpHome)).not.toThrow()
    const dst = path.join(tmpHome, '.aimaestro', 'agents', toId)
    // Migration short-circuits before mkdir when source is missing — new dir
    // will be (re-)created later by provisionCloudClaudeConfig.
    expect(fs.existsSync(dst)).toBe(false)
  })

  it('skips individual asset copies that error without aborting the whole migration', () => {
    // Predecessor has only claude-home.json; credentials + gh missing
    const partialFromId = 'aaaaaaaa-1111-1111-1111-111111111111'
    const partialDir = path.join(tmpHome, '.aimaestro', 'agents', partialFromId)
    fs.mkdirSync(partialDir, { recursive: true })
    fs.writeFileSync(path.join(partialDir, 'claude-home.json'), '{"keep":true}\n', { mode: 0o600 })

    migrateAgentPersistence(partialFromId, toId, tmpHome)
    const newDir = path.join(tmpHome, '.aimaestro', 'agents', toId)
    expect(fs.existsSync(path.join(newDir, 'claude-home.json'))).toBe(true)
    expect(fs.existsSync(path.join(newDir, 'claude-credentials.json'))).toBe(false)
    expect(fs.existsSync(path.join(newDir, 'gh-config'))).toBe(false)
  })
})

describe('buildAmpCommonEnv', () => {
  const uuid = '22222222-2222-2222-2222-222222222222'
  const name = 'ops-exec-test'
  const hostUrl = 'http://host.docker.internal:23000'

  it('returns the identity/name/routing/path/gemini-trust envs', () => {
    expect(buildAmpCommonEnv(uuid, name, hostUrl)).toEqual({
      CLAUDE_AGENT_ID: uuid,
      CLAUDE_AGENT_NAME: name,
      AMP_DIR: `/home/claude/.agent-messaging/agents/${uuid}`,
      AMP_MAESTRO_URL: hostUrl,
      PATH: '/home/claude/.local/bin:/home/claude/.local/share/aimaestro/cli:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      GEMINI_CLI_TRUST_WORKSPACE: 'true',
    })
  })

  it('puts the AMP CLI dir ahead of the standard path', () => {
    const env = buildAmpCommonEnv(uuid, name, hostUrl)
    expect(env.PATH.split(':')[0]).toBe('/home/claude/.local/bin')
  })

  it('sets GEMINI_CLI_TRUST_WORKSPACE=true so gemini-program agents skip the trust modal (kanban cd2d7377)', () => {
    const env = buildAmpCommonEnv(uuid, name, hostUrl)
    expect(env.GEMINI_CLI_TRUST_WORKSPACE).toBe('true')
  })

  it('passes the extraEnv validator', () => {
    expect(validateExtraEnv(buildAmpCommonEnv(uuid, name, hostUrl))).toBeNull()
  })
})

describe('mergeMounts', () => {
  it('returns common mounts when operator is undefined', () => {
    const common: SandboxMount[] = [{ hostPath: '/a', containerPath: '/x' }]
    expect(mergeMounts(common, undefined)).toEqual(common)
  })

  it('returns common mounts when operator is empty', () => {
    const common: SandboxMount[] = [{ hostPath: '/a', containerPath: '/x' }]
    expect(mergeMounts(common, [])).toEqual(common)
  })

  it('preserves operator order then appends untouched common mounts', () => {
    const common: SandboxMount[] = [
      { hostPath: '/a', containerPath: '/x' },
      { hostPath: '/b', containerPath: '/y' },
    ]
    const operator: SandboxMount[] = [{ hostPath: '/c', containerPath: '/z' }]
    expect(mergeMounts(common, operator)).toEqual([
      { hostPath: '/c', containerPath: '/z' },
      { hostPath: '/a', containerPath: '/x' },
      { hostPath: '/b', containerPath: '/y' },
    ])
  })

  it('lets operator override a common mount at the same containerPath', () => {
    const common: SandboxMount[] = [
      { hostPath: '/host/default', containerPath: '/x', readOnly: true },
    ]
    const operator: SandboxMount[] = [
      { hostPath: '/host/override', containerPath: '/x' },
    ]
    expect(mergeMounts(common, operator)).toEqual([
      { hostPath: '/host/override', containerPath: '/x' },
    ])
  })
})

describe('mergeEnv', () => {
  it('returns common env when operator is undefined', () => {
    expect(mergeEnv({ FOO: 'bar' }, undefined)).toEqual({ FOO: 'bar' })
  })

  it('lets operator override a common key', () => {
    expect(mergeEnv({ FOO: 'common' }, { FOO: 'operator' })).toEqual({ FOO: 'operator' })
  })

  it('union-merges disjoint keys', () => {
    expect(mergeEnv({ FOO: 'a' }, { BAR: 'b' })).toEqual({ FOO: 'a', BAR: 'b' })
  })

  // Precedence chain image-default < auto-injected < operator. The image's
  // ENV is the docker baseline; -e flags override it; mergeEnv layers operator
  // overrides on top of auto. This test pins the auto-vs-operator step.
  it('preserves operator override of an auto-injected AMP env', () => {
    const uuid = '33333333-3333-3333-3333-333333333333'
    const auto = buildAmpCommonEnv(uuid, 'ops-exec-test', 'http://host.docker.internal:23000')
    const operator = { AMP_MAESTRO_URL: 'http://operator-override:9999' }
    const merged = mergeEnv(auto, operator)
    expect(merged.AMP_MAESTRO_URL).toBe('http://operator-override:9999')
    expect(merged.CLAUDE_AGENT_ID).toBe(uuid) // un-overridden auto values stay
  })
})

// ─── buildRecreateBody — registry → DockerCreateRequest field mapping ───
//
// This is the unit that closes the cluster surfaced 2026-04-28 (kanban
// 5e4ebdd5): post-recreate cloud agents had `programArgs: --yolo` in their
// registry profile but no --yolo in the container's AI_TOOL env. Root cause
// was the operator-assembled docker-create body dropping fields the operator
// didn't remember to forward. The recreate endpoint now builds the body
// server-side via this helper, so the registry → container mapping is
// exhaustive by construction.
describe('buildRecreateBody', () => {
  function makeCloudAgent(overrides: Partial<Agent> = {}): Agent {
    return {
      id: 'old-uuid-aaaaaaaa',
      name: 'ops-exec-test',
      label: 'TestAgent',
      avatar: '🧪',
      sessions: [],
      hostId: 'test-host',
      program: 'claude',
      taskDescription: 'test',
      tools: { claude: true },
      status: 'online',
      createdAt: '2026-04-28T00:00:00Z',
      lastActive: '2026-04-28T00:00:00Z',
      deployment: {
        type: 'cloud',
        cloud: {
          provider: 'local-container',
          containerName: 'aim-ops-exec-test',
          status: 'running',
        },
      },
      ...overrides,
    } as Agent
  }

  it('maps programArgs from registry into the create body', () => {
    const agent = makeCloudAgent({ programArgs: '--yolo' })
    expect(buildRecreateBody(agent).programArgs).toBe('--yolo')
  })

  it('maps model from registry into the create body', () => {
    const agent = makeCloudAgent({ model: 'claude-sonnet-4-6' })
    expect(buildRecreateBody(agent).model).toBe('claude-sonnet-4-6')
  })

  it('maps workingDirectory from registry', () => {
    const agent = makeCloudAgent({ workingDirectory: '/home/gosub/distill' })
    expect(buildRecreateBody(agent).workingDirectory).toBe('/home/gosub/distill')
  })

  it('maps sandbox.mounts from deployment into top-level body.mounts', () => {
    const mounts: SandboxMount[] = [
      { hostPath: '/mnt/agents/hardin', containerPath: '/mnt/agents/hardin' },
    ]
    const agent = makeCloudAgent({
      deployment: {
        type: 'cloud',
        cloud: { provider: 'local-container', containerName: 'aim-x', status: 'running', websocketUrl: 'ws://localhost:46000/term' },
        sandbox: { mounts },
      },
    })
    expect(buildRecreateBody(agent).mounts).toEqual(mounts)
  })

  it('preserves identity fields (name, label, avatar, hostId, program)', () => {
    const agent = makeCloudAgent()
    const body = buildRecreateBody(agent)
    expect(body.name).toBe('ops-exec-test')
    expect(body.label).toBe('TestAgent')
    expect(body.avatar).toBe('🧪')
    expect(body.hostId).toBe('test-host')
    expect(body.program).toBe('claude')
  })

  it('omits container-derived fields (containerName/port/websocketUrl regenerate at create)', () => {
    const agent = makeCloudAgent()
    const body = buildRecreateBody(agent)
    // No keys at the top of DockerCreateRequest carry container-state — they're
    // recomputed by createDockerAgent from `name` + auto-allocated port.
    expect(body).not.toHaveProperty('containerName')
    expect(body).not.toHaveProperty('port')
    expect(body).not.toHaveProperty('websocketUrl')
  })

  it('handles missing optional fields cleanly', () => {
    const agent = makeCloudAgent({
      label: undefined,
      avatar: undefined,
      programArgs: undefined,
      model: undefined,
      workingDirectory: undefined,
    })
    const body = buildRecreateBody(agent)
    // Required fields stay; optional fields are undefined (createDockerAgent
    // applies its own defaults — workDir → /tmp, program → 'claude' etc.)
    expect(body.name).toBe('ops-exec-test')
    expect(body.programArgs).toBeUndefined()
    expect(body.model).toBeUndefined()
    expect(body.workingDirectory).toBeUndefined()
  })

  it('handles missing deployment.sandbox without throwing', () => {
    const agent = makeCloudAgent() // no sandbox key at all
    expect(buildRecreateBody(agent).mounts).toBeUndefined()
  })
})

describe('RECREATE_PRESERVED_FIELDS', () => {
  it('lists agent-record fields that are NOT part of DockerCreateRequest', () => {
    // Pin the contract: these fields live on Agent but not DockerCreateRequest,
    // so recreate must patch them onto the new agent post-create. Adding to
    // this list = adding a preservation; removing = an explicit drop.
    expect(RECREATE_PRESERVED_FIELDS).toEqual([
      'hooks',
      'taskDescription',
      'tags',
      'capabilities',
      'role',
      'team',
      'documentation',
      'metadata',
      'skills',
      'preferences',
      'meshAware',
      'owner',
    ])
  })

  it('does not include fields that re-derive at create time', () => {
    // Container/host-state fields must NOT be in this list. If any of these
    // appear, recreate would copy stale values from the dead agent onto the
    // new one (e.g. old containerName, old AMP fingerprint).
    const mustNotInclude = [
      'id', 'sessions', 'createdAt', 'lastActive', 'status',
      'deployment', 'ampIdentity', 'launchCount',
      'hostName', 'hostUrl', 'isSelf',
    ]
    for (const field of mustNotInclude) {
      expect(RECREATE_PRESERVED_FIELDS).not.toContain(field)
    }
  })
})
