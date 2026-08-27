import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { writeAgentDirHint } from '@/lib/agent-registry'

// Use a dir under the repo (not /tmp — the helper intentionally skips scratch dirs).
const tmpRoot = path.join(process.cwd(), '.vitest-hint-tmp')

function freshDir(name: string): string {
  const d = path.join(tmpRoot, name)
  fs.mkdirSync(d, { recursive: true })
  return d
}
function readSettings(dir: string): any {
  const f = path.join(dir, '.claude', 'settings.local.json')
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : null
}

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('writeAgentDirHint', () => {
  it('creates settings.local.json with the env hint when none exists', () => {
    const d = freshDir('new')
    writeAgentDirHint('my-agent', d)
    expect(readSettings(d)?.env?.CLAUDE_AGENT_NAME).toBe('my-agent')
  })

  it('merges into existing settings without clobbering other keys', () => {
    const d = freshDir('merge')
    fs.mkdirSync(path.join(d, '.claude'), { recursive: true })
    fs.writeFileSync(
      path.join(d, '.claude', 'settings.local.json'),
      JSON.stringify({ permissions: { allow: ['Bash(ls:*)'] }, env: { FOO: 'bar' } })
    )
    writeAgentDirHint('agent-x', d)
    const s = readSettings(d)
    expect(s.env.CLAUDE_AGENT_NAME).toBe('agent-x')
    expect(s.env.FOO).toBe('bar')                    // other env preserved
    expect(s.permissions.allow).toContain('Bash(ls:*)') // other keys preserved
  })

  it('overwrites a stale hint with the current agent name', () => {
    const d = freshDir('stale')
    fs.mkdirSync(path.join(d, '.claude'), { recursive: true })
    fs.writeFileSync(
      path.join(d, '.claude', 'settings.local.json'),
      JSON.stringify({ env: { CLAUDE_AGENT_NAME: 'old-name' } })
    )
    writeAgentDirHint('new-name', d)
    expect(readSettings(d).env.CLAUDE_AGENT_NAME).toBe('new-name')
  })

  it('does not clobber an unparseable settings file', () => {
    const d = freshDir('corrupt')
    fs.mkdirSync(path.join(d, '.claude'), { recursive: true })
    const f = path.join(d, '.claude', 'settings.local.json')
    fs.writeFileSync(f, '{ not valid json')
    writeAgentDirHint('agent-x', d)
    expect(fs.readFileSync(f, 'utf-8')).toBe('{ not valid json') // untouched
  })

  it('is a no-op for root, scratch, empty-name, and missing dirs', () => {
    // root — never write
    writeAgentDirHint('x', '/')
    expect(fs.existsSync('/.claude/settings.local.json')).toBe(false)
    // scratch under /tmp — skipped (/tmp exists on macOS and Linux; on macOS it
    // resolves under /private/tmp. Both prefixes are guarded in agent-registry.)
    const scratch = fs.mkdtempSync('/tmp/hint-')
    writeAgentDirHint('x', scratch)
    expect(readSettings(scratch)).toBeNull()
    fs.rmSync(scratch, { recursive: true, force: true })
    // empty agent name — skipped
    const d = freshDir('emptyname')
    writeAgentDirHint('', d)
    expect(readSettings(d)).toBeNull()
    // non-existent dir — not created
    const missing = path.join(tmpRoot, 'does-not-exist')
    writeAgentDirHint('x', missing)
    expect(fs.existsSync(missing)).toBe(false)
  })
})
