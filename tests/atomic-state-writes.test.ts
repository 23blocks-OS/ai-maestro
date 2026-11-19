/**
 * B042 (docs/SPEC-ATOMIC-STATE-WRITES.md): the atomic-write helper, the registry that refuses to save
 * over a file it cannot read, and the trust write to .claude.json. Everything runs in a temporary
 * HOME and CLAUDE_CONFIG_DIR; the real ~/.aimaestro and ~/.claude.json are never touched.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeFileAtomicSync } from '@/lib/atomic-write.mjs'

let tmp: string
const realHome = process.env.HOME
const realConfigDir = process.env.CLAUDE_CONFIG_DIR

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'b042-')))
})
afterEach(() => {
  process.env.HOME = realHome
  if (realConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = realConfigDir
  fs.rmSync(tmp, { recursive: true, force: true })
})

const leftovers = () => fs.readdirSync(tmp).filter(f => f.endsWith('.tmp'))

describe('writeFileAtomicSync', () => {
  it('writes, keeps the old mode and leaves no temp file', () => {
    const f = path.join(tmp, 'secret.json')
    fs.writeFileSync(f, 'old', { mode: 0o600 })
    writeFileAtomicSync(f, 'new')
    expect(fs.readFileSync(f, 'utf8')).toBe('new')
    expect(fs.statSync(f).mode & 0o777).toBe(0o600)
    expect(leftovers()).toEqual([])
  })

  it('a new file gets opts.mode', () => {
    const f = path.join(tmp, 'new.json')
    writeFileAtomicSync(f, 'x', { mode: 0o600 })
    expect(fs.statSync(f).mode & 0o777).toBe(0o600)
  })

  for (const step of ['writeFileSync', 'fsyncSync', 'renameSync'] as const) {
    it(`a failure in ${step} leaves the old content and no temp file`, () => {
      const f = path.join(tmp, 'registry.json')
      fs.writeFileSync(f, 'old')
      const failing = { ...fs, [step]: (...args: any[]) => {
        if (step === 'writeFileSync') (fs.writeFileSync as any)(args[0], 'half') // a torn temp file
        throw new Error(`disk full in ${step}`)
      } }
      expect(() => writeFileAtomicSync(f, 'new content', { fs: failing })).toThrow(/disk full/)
      expect(fs.readFileSync(f, 'utf8')).toBe('old')
      expect(leftovers()).toEqual([])
    })
  }

  it('beforeRename can abort the write', () => {
    const f = path.join(tmp, 'a.json')
    fs.writeFileSync(f, 'old')
    expect(() => writeFileAtomicSync(f, 'new', { beforeRename: () => { throw new Error('changed') } })).toThrow('changed')
    expect(fs.readFileSync(f, 'utf8')).toBe('old')
    expect(leftovers()).toEqual([])
  })

  it('refuses a symbolic link and leaves its target alone', () => {
    const target = path.join(tmp, 'target.json')
    const link = path.join(tmp, 'link.json')
    fs.writeFileSync(target, 'keep')
    fs.symlinkSync(target, link)
    expect(() => writeFileAtomicSync(link, 'new')).toThrow(/symbolic link/)
    expect(fs.readFileSync(target, 'utf8')).toBe('keep')
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true)
  })
})

/** agent-registry with HOME pointed at the temp folder (its paths are fixed at import) */
async function registryModule() {
  process.env.HOME = tmp
  vi.resetModules()
  return import('@/lib/agent-registry')
}

describe('registry.json', () => {
  it('missing file: loads as empty and saves', async () => {
    const reg = await registryModule()
    expect(reg.loadAgents()).toEqual([])
    expect(reg.getRegistryError()).toBeNull()
    expect(reg.saveAgents([{ id: 'a1', name: 'one' } as any])).toBe(true)
    const file = path.join(tmp, '.aimaestro', 'agents', 'registry.json')
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))[0].id).toBe('a1')
  })

  for (const [label, content] of [['cut-short', '[{"id":"a1","name":"one"},{"id":"a2'], ['not a list', '{"agents":[]}']]) {
    it(`${label} file: load reports it, save refuses, the file is kept and copied`, async () => {
      const dir = path.join(tmp, '.aimaestro', 'agents')
      const file = path.join(dir, 'registry.json')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(file, content)
      const reg = await registryModule()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(reg.loadAgents()).toEqual([])
      const err = reg.getRegistryError()
      expect(err?.error).toBeTruthy()
      expect(reg.saveAgents([{ id: 'new', name: 'new' } as any])).toBe(false)
      expect(fs.readFileSync(file, 'utf8')).toBe(content)
      expect(fs.readFileSync(err!.backup!, 'utf8')).toBe(content)
      expect(() => reg.createAgent({ name: 'blocked', program: 'Claude Code', taskDescription: 'x' } as any)).toThrow(/cannot be read/)

      // Repaired by the operator: saving resumes, and the first save keeps a last-good copy
      fs.writeFileSync(file, '[{"id":"a1","name":"one"}]')
      expect(reg.loadAgents()).toHaveLength(1)
      expect(reg.getRegistryError()).toBeNull()
      expect(reg.saveAgents([{ id: 'a1', name: 'one' }, { id: 'a2', name: 'two' }] as any)).toBe(true)
      expect(JSON.parse(fs.readFileSync(`${file}.last-good`, 'utf8'))).toHaveLength(1)
    })
  }

  it('serves the last good list while the file is unreadable', async () => {
    const dir = path.join(tmp, '.aimaestro', 'agents')
    const file = path.join(dir, 'registry.json')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file, '[{"id":"a1","name":"one","runtime":"tmux"}]')
    const reg = await registryModule()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(reg.loadAgents()).toHaveLength(1)
    fs.writeFileSync(file, '[{"id":')
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000)) // a new mtime, so the cache is not used
    expect(reg.loadAgents()).toHaveLength(1)
    expect(reg.getRegistryError()).not.toBeNull()
  })
})

describe('trustProjectDirectory', () => {
  function setup(config: unknown = { numStartups: 7, projects: { '/other': { allowedTools: ['x'] } } }) {
    const project = path.join(tmp, 'project')
    fs.mkdirSync(project)
    const configDir = path.join(tmp, 'config')
    fs.mkdirSync(configDir)
    const file = path.join(configDir, '.claude.json')
    if (config !== null) fs.writeFileSync(file, typeof config === 'string' ? config : JSON.stringify(config))
    process.env.CLAUDE_CONFIG_DIR = configDir
    return { project, file }
  }

  it('honours CLAUDE_CONFIG_DIR and keeps every other key', async () => {
    const { project, file } = setup()
    const { trustProjectDirectory } = await registryModule()
    expect(trustProjectDirectory(project)).toBe(true)
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(cfg.projects[project].hasTrustDialogAccepted).toBe(true)
    expect(cfg.numStartups).toBe(7)
    expect(cfg.projects['/other']).toEqual({ allowedTools: ['x'] })
    expect(fs.existsSync(path.join(tmp, '.claude.json'))).toBe(false) // not the home one
  })

  it("an agent's config-dir profile wins over the environment", async () => {
    const { project } = setup()
    const own = path.join(tmp, 'own-login')
    fs.mkdirSync(own)
    fs.writeFileSync(path.join(own, '.claude.json'), '{}')
    const { trustProjectDirectory } = await registryModule()
    expect(trustProjectDirectory(project, { kind: 'config-dir', dir: own })).toBe(true)
    expect(JSON.parse(fs.readFileSync(path.join(own, '.claude.json'), 'utf8')).projects[project].hasTrustDialogAccepted).toBe(true)
  })

  it('keys the project by its real path', async () => {
    const { project, file } = setup()
    const alias = path.join(tmp, 'alias')
    fs.symlinkSync(project, alias)
    const { trustProjectDirectory } = await registryModule()
    expect(trustProjectDirectory(alias)).toBe(true)
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(cfg.projects[project].hasTrustDialogAccepted).toBe(true)
    expect(cfg.projects[alias]).toBeUndefined()
  })

  it('does not follow a symbolic link to the config file', async () => {
    const { project, file } = setup(null)
    const real = path.join(tmp, 'real.json')
    fs.writeFileSync(real, '{}')
    fs.symlinkSync(real, file)
    const { trustProjectDirectory } = await registryModule()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(trustProjectDirectory(project)).toBe(false)
    expect(fs.readFileSync(real, 'utf8')).toBe('{}')
    expect(fs.lstatSync(file).isSymbolicLink()).toBe(true)
  })

  it('leaves a malformed file alone and never creates a missing one', async () => {
    const { project, file } = setup('{"projects": {')
    const { trustProjectDirectory } = await registryModule()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(trustProjectDirectory(project)).toBe(false)
    expect(fs.readFileSync(file, 'utf8')).toBe('{"projects": {')
    fs.rmSync(file)
    expect(trustProjectDirectory(project)).toBe(false)
    expect(fs.existsSync(file)).toBe(false)
  })
})
