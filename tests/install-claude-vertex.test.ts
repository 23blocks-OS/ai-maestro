/**
 * F049: scripts/install-claude-vertex.sh against a temporary HOME. Never touches the real home folder
 * and never runs Claude Code or gcloud (--no-token-check, and PATH holds no claude).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const SCRIPT = path.join(process.cwd(), 'scripts/install-claude-vertex.sh')
const BEGIN = '<!-- ai-maestro-messaging:begin -->'
const END = '<!-- ai-maestro-messaging:end -->'
const ALLOW = [
  'Read',
  'Bash(amp-inbox.sh:*)', 'Bash(amp-read.sh:*)', 'Bash(amp-reply.sh:*)', 'Bash(amp-send.sh:*)', 'Bash(amp-status.sh:*)',
  'Bash(amp-inbox:*)', 'Bash(amp-read:*)', 'Bash(amp-reply:*)', 'Bash(amp-send:*)', 'Bash(amp-status:*)',
]
const DENY = ['Write', 'Edit', 'NotebookEdit', 'WebFetch', 'WebSearch']

let home: string
const p = (...s: string[]) => path.join(home, ...s)
const run = (...args: string[]) => spawnSync('bash', [SCRIPT, ...args], {
  env: { PATH: process.env.PATH as string, HOME: home } as unknown as NodeJS.ProcessEnv,
  encoding: 'utf8', timeout: 30000,
})
const json = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'))
const settings = () => json(p('.claude', 'settings.json'))
const baks = (dir: string, base: string) => fs.readdirSync(dir).filter(n => n.startsWith(base + '.aimaestro-backup-'))
const snapshot = () => {
  const out: Record<string, string> = {}
  const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const f = path.join(d, e.name)
    e.isDirectory() ? walk(f) : (out[f] = fs.readFileSync(f, 'utf8'))
  })
  walk(home)
  return out
}

beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'install-claude-vertex-')) })
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }) })

describe('install-claude-vertex.sh', () => {
  it('fresh install (full profile) writes env and onboarding only', () => {
    const r = run('--project', 'my-proj', '--yes')
    expect(r.status).toBe(0)
    const s = settings()
    expect(s.env).toMatchObject({
      CLAUDE_CODE_USE_VERTEX: '1', CLOUD_ML_REGION: 'global', ANTHROPIC_VERTEX_PROJECT_ID: 'my-proj',
      ANTHROPIC_MODEL: 'claude-haiku-5-5', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-5-5',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-haiku-5-5', ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-haiku-5-5',
      ANTHROPIC_SMALL_FAST_MODEL: 'claude-haiku-5-5', CLAUDE_CODE_SUBAGENT_MODEL: 'claude-haiku-5-5',
      DISABLE_TELEMETRY: '1', DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    })
    expect(s.permissions).toBeUndefined()
    expect(fs.existsSync(p('.claude', 'CLAUDE.md'))).toBe(false)
    expect(json(p('.claude.json')).hasCompletedOnboarding).toBe(true)
    expect(r.stdout).toContain('roles/aiplatform.user')
  })

  it('uses --model and --region', () => {
    run('--project', 'my-proj', '--model', 'claude-haiku-4-5', '--region', 'us-east5', '--yes')
    const e = settings().env
    expect(e.ANTHROPIC_MODEL).toBe('claude-haiku-4-5')
    expect(e.CLAUDE_CODE_SUBAGENT_MODEL).toBe('claude-haiku-4-5')
    expect(e.CLOUD_ML_REGION).toBe('us-east5')
  })

  it('merges: keeps hooks, other keys, the user\'s own permissions and other env', () => {
    fs.mkdirSync(p('.claude'), { recursive: true })
    fs.writeFileSync(p('.claude', 'settings.json'), JSON.stringify({
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] },
      model: 'keepme', env: { MY_VAR: 'a' },
      permissions: { allow: ['Bash(ls:*)'], deny: ['Bash(rm:*)'], defaultMode: 'acceptEdits' },
    }))
    fs.writeFileSync(p('.claude.json'), JSON.stringify({ projects: { a: 1 }, theme: 'light' }))
    const r = run('--project', 'my-proj', '--profile', 'messaging', '--yes')
    expect(r.status).toBe(0)
    const s = settings()
    expect(s.hooks.Stop).toBeDefined()
    expect(s.model).toBe('keepme')
    expect(s.env.MY_VAR).toBe('a')
    expect(s.permissions.allow).toEqual(['Bash(ls:*)', ...ALLOW])
    expect(s.permissions.deny).toEqual(['Bash(rm:*)', ...DENY])
    expect(s.permissions.defaultMode).toBe('acceptEdits')
    expect(r.stdout).toMatch(/defaultMode is 'acceptEdits' and was kept/)
    const c = json(p('.claude.json'))
    expect(c.projects).toEqual({ a: 1 })
    expect(c.theme).toBe('light')
    expect(c.hasCompletedOnboarding).toBe(true)
  })

  it('backs up each changed file, and only changed files', () => {
    fs.mkdirSync(p('.claude'), { recursive: true })
    const original = JSON.stringify({ hooks: {} })
    fs.writeFileSync(p('.claude', 'settings.json'), original)
    fs.writeFileSync(p('.claude.json'), '{}')
    run('--project', 'my-proj', '--yes')
    const b = baks(p('.claude'), 'settings.json')
    expect(b).toHaveLength(1)
    expect(fs.readFileSync(p('.claude', b[0]), 'utf8')).toBe(original)
    expect(baks(home, '.claude.json')).toHaveLength(1)
    // a fresh file has nothing to back up
    expect(baks(p('.claude'), 'CLAUDE.md')).toHaveLength(0)
  })

  it('is idempotent: a second run changes nothing and makes no new backup', () => {
    run('--project', 'my-proj', '--profile', 'messaging', '--agent-dir', p('agent'), '--yes')
    const before = snapshot()
    const r = run('--project', 'my-proj', '--profile', 'messaging', '--agent-dir', p('agent'), '--yes')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('Nothing to change')
    expect(snapshot()).toEqual(before)
  })

  it('messaging profile writes exactly the allow and deny lists, dontAsk, and the CLAUDE.md block', () => {
    run('--project', 'my-proj', '--profile', 'messaging', '--yes')
    const s = settings()
    expect(s.permissions.allow).toEqual(ALLOW)
    expect(s.permissions.deny).toEqual(DENY)
    expect(s.permissions.defaultMode).toBe('dontAsk')
    expect(s.permissions.deny).not.toContain('MultiEdit')
    expect(s.permissions.allow.some((a: string) => a.startsWith('mcp__'))).toBe(false)
    const md = fs.readFileSync(p('.claude', 'CLAUDE.md'), 'utf8')
    expect(md.startsWith(BEGIN)).toBe(true)
    expect(md.trimEnd().endsWith(END)).toBe(true)
    expect(md).toContain('amp-inbox.sh')
    expect(md).toContain('amp-read.sh <id>')
    expect(md).toContain('amp-reply.sh <id>')
    expect(md).toContain('<external-content>')
    expect(md).toMatch(/NOT delivered/)
  })

  it('replaces only the managed CLAUDE.md block and keeps the user\'s own text', () => {
    fs.mkdirSync(p('.claude'), { recursive: true })
    fs.writeFileSync(p('.claude', 'CLAUDE.md'), `# Mine\nBe kind.\n\n${BEGIN}\nOLD TEXT\n${END}\n\nafter me\n`)
    run('--project', 'my-proj', '--profile', 'messaging', '--yes')
    const md = fs.readFileSync(p('.claude', 'CLAUDE.md'), 'utf8')
    expect(md).not.toContain('OLD TEXT')
    expect(md.startsWith('# Mine\nBe kind.\n\n' + BEGIN)).toBe(true)
    expect(md.endsWith(END + '\n\nafter me\n')).toBe(true)
    expect(md.split(BEGIN).length - 1).toBe(1)
    // appends after existing text when there is no block yet
    fs.writeFileSync(p('.claude', 'CLAUDE.md'), 'just mine')
    run('--project', 'my-proj', '--profile', 'messaging', '--yes')
    expect(fs.readFileSync(p('.claude', 'CLAUDE.md'), 'utf8').startsWith('just mine\n\n' + BEGIN)).toBe(true)
  })

  it('--agent-dir writes settings.local.json, merges env and drops the blanket permissions', () => {
    const agent = p('work', 'agent1')
    fs.mkdirSync(path.join(agent, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(agent, '.claude', 'settings.local.json'), JSON.stringify({
      env: { AIM_NAME: 'a1' },
      permissions: { allow: ['Bash(*)', 'Write(*)', 'Edit(*)', 'WebFetch(*)', 'Bash(git status:*)'] },
    }))
    const r = run('--project', 'my-proj', '--agent-dir', agent, '--yes')
    expect(r.status).toBe(0)
    const a = json(path.join(agent, '.claude', 'settings.local.json'))
    expect(a.env.AIM_NAME).toBe('a1')
    expect(a.env.CLAUDE_CODE_USE_VERTEX).toBe('1')
    expect(a.permissions.allow).toEqual(['Bash(git status:*)', ...ALLOW])
    expect(a.permissions.deny).toEqual([...DENY, 'Task'])
    expect(a.permissions.defaultMode).toBe('dontAsk')
    expect(baks(path.join(agent, '.claude'), 'settings.local.json')).toHaveLength(1)
    expect(r.stdout).toContain('removed blanket allow rules')
  })

  it('--check changes nothing, even with no config at all', () => {
    let r = run('--check', '--no-token-check')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('not found')
    expect(r.stdout).toContain('roles/aiplatform.user')
    expect(fs.readdirSync(home)).toEqual([])
    run('--project', 'my-proj', '--profile', 'messaging', '--yes')
    const before = snapshot()
    r = run('--check', '--no-token-check')
    expect(r.stdout).toContain('ANTHROPIC_VERTEX_PROJECT_ID = my-proj')
    expect(r.stdout).toContain('messaging profile allow rules present: yes')
    expect(snapshot()).toEqual(before)
  })

  it('refuses invalid JSON and changes nothing', () => {
    fs.mkdirSync(p('.claude'), { recursive: true })
    fs.writeFileSync(p('.claude', 'settings.json'), '{ not json')
    const r = run('--project', 'my-proj', '--profile', 'messaging', '--yes')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('not valid JSON')
    expect(fs.readFileSync(p('.claude', 'settings.json'), 'utf8')).toBe('{ not json')
    expect(fs.existsSync(p('.claude.json'))).toBe(false)
    expect(fs.existsSync(p('.claude', 'CLAUDE.md'))).toBe(false)
    // a bad ~/.claude.json also stops before any write
    fs.rmSync(p('.claude', 'settings.json'))
    fs.writeFileSync(p('.claude.json'), '[1,2]')
    const r2 = run('--project', 'my-proj', '--yes')
    expect(r2.status).not.toBe(0)
    expect(fs.existsSync(p('.claude', 'settings.json'))).toBe(false)
  })

  it('--dry-run prints the new content and writes nothing', () => {
    const r = run('--project', 'my-proj', '--profile', 'messaging', '--dry-run')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('"CLAUDE_CODE_USE_VERTEX": "1"')
    expect(r.stdout).toContain('Bash(amp-reply.sh:*)')
    expect(r.stdout).toContain('--dry-run: nothing was written')
    expect(fs.readdirSync(home)).toEqual([])
  })

  it('needs --yes when not interactive, and needs --project', () => {
    const r = run('--project', 'my-proj')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('--yes')
    expect(fs.readdirSync(home)).toEqual([])
    expect(run('--yes').status).toBe(2)
    expect(run('--project', 'bad id; rm', '--yes').status).not.toBe(0)
    expect(run('--project', 'p-123', '--profile', 'other', '--yes').status).toBe(2)
  })
})
