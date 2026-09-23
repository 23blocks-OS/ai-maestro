/**
 * Where an agent works (lib/working-directory.ts) and the folder picker's
 * backend (services/browse-service.ts), with the Windows (WSL) cases a
 * first-day WSL user hits: an empty Linux home, a pasted C:\ path, a folder on
 * a Windows drive, and not knowing where the files are from Windows.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'

const HOME = fs.mkdtempSync(path.join(tmpdir(), 'wd-'))
vi.mock('os', async (orig) => {
  const real = await orig<typeof import('os')>()
  return { ...real, default: { ...real, homedir: () => HOME }, homedir: () => HOME }
})

import {
  resolveWorkingDirectory, windowsToWslPath, windowsPathFor, isWindowsDriveMount,
  defaultAgentDirectory, _setWslInfoForTest,
} from '@/lib/working-directory'
import { isAllowedPath, createFolder, browseDirectory } from '@/services/browse-service'

const WSL = { isWsl: true, distro: 'Ubuntu' }
const MAC = { isWsl: false, distro: null }

beforeEach(() => {
  fs.rmSync(path.join(HOME, 'agents'), { recursive: true, force: true })
  _setWslInfoForTest(null)
})
afterAll(() => fs.rmSync(HOME, { recursive: true, force: true }))

describe('path translation', () => {
  it('turns a Windows path into its WSL form', () => {
    expect(windowsToWslPath('C:\\Users\\me\\Projects')).toBe('/mnt/c/Users/me/Projects')
    expect(windowsToWslPath('d:/work/')).toBe('/mnt/d/work')
    expect(windowsToWslPath('C:\\')).toBe('/mnt/c')
    expect(windowsToWslPath('/home/me')).toBeNull()
  })

  it('knows a Windows drive seen from WSL', () => {
    expect(isWindowsDriveMount('/mnt/c/Users/me')).toBe(true)
    expect(isWindowsDriveMount('/mnt/c')).toBe(true)
    expect(isWindowsDriveMount('/mnt/wsl')).toBe(false)
    expect(isWindowsDriveMount('/home/me')).toBe(false)
  })

  it('gives the path File Explorer opens', () => {
    expect(windowsPathFor('/home/me/agents/x', 'Ubuntu')).toBe('\\\\wsl.localhost\\Ubuntu\\home\\me\\agents\\x')
    expect(windowsPathFor('/mnt/c/Users/me', 'Ubuntu')).toBe('C:\\Users\\me')
    expect(windowsPathFor('/home/me', null)).toBeNull()
  })
})

describe('resolveWorkingDirectory', () => {
  it('no folder: the agent gets its own ~/agents/<name>, created (not the AI Maestro install dir)', () => {
    const r = resolveWorkingDirectory('', 'backend', MAC)
    expect(r).toMatchObject({ ok: true, cwd: defaultAgentDirectory('backend'), created: true })
    expect(fs.existsSync(r.cwd!)).toBe(true)
    expect(r.cwd).not.toBe(process.cwd())
  })

  it('on WSL, says where Windows can open it', () => {
    const r = resolveWorkingDirectory(undefined, 'backend', WSL)
    expect(r.windowsPath).toBe(`\\\\wsl.localhost\\Ubuntu${r.cwd!.replace(/\//g, '\\')}`)
  })

  it('expands ~', () => {
    fs.mkdirSync(path.join(HOME, 'proj'), { recursive: true })
    expect(resolveWorkingDirectory('~/proj', 'a', MAC)).toMatchObject({ ok: true, cwd: path.join(HOME, 'proj') })
  })

  it('refuses a missing folder with a plain explanation instead of starting the agent elsewhere', () => {
    const r = resolveWorkingDirectory(path.join(HOME, 'nope'), 'a', MAC)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/does not exist/)
    expect(r.error).toMatch(/~\/agents\/a/)
  })

  it('refuses a relative path', () => {
    expect(resolveWorkingDirectory('projects/x', 'a', MAC)).toMatchObject({ ok: false })
  })

  it('refuses a Windows path when not on Windows', () => {
    const r = resolveWorkingDirectory('C:\\Users\\me', 'a', MAC)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Windows path/)
  })

  it('on WSL, translates a pasted C:\\ path and says so (the folder must still exist)', () => {
    const r = resolveWorkingDirectory('C:\\definitely-not-here-xyz', 'a', WSL)
    expect(r.ok).toBe(false)
    expect(r.warnings[0]).toMatch(/\/mnt\/c\/definitely-not-here-xyz/)
    expect(r.error).toMatch(/\/mnt\/c\/definitely-not-here-xyz does not exist/)
  })
})

describe('browse service', () => {
  it('allowed roots are real prefixes: /homeX is not /home', () => {
    expect(isAllowedPath('/home/me', ['/home'])).toBe(true)
    expect(isAllowedPath('/home', ['/home'])).toBe(true)
    expect(isAllowedPath('/homeX/me', ['/home'])).toBe(false)
  })

  it('reaches Windows drives only on WSL', () => {
    _setWslInfoForTest(MAC)
    expect(isAllowedPath('/mnt/c/Users')).toBe(false)
    _setWslInfoForTest(WSL)
    expect(isAllowedPath('/mnt/c/Users')).toBe(true)
  })

  it('lists the home, with the agents shortcut, and the Windows path on WSL', () => {
    _setWslInfoForTest(WSL)
    fs.mkdirSync(path.join(HOME, 'agents'), { recursive: true })
    const r = browseDirectory(null)
    expect(r.status).toBe(200)
    const d = r.data as any
    expect(d.path).toBe(HOME)
    expect(d.isWsl).toBe(true)
    expect(d.shortcuts.map((s: any) => s.name)).toContain('agents')
    expect(d.windowsPath).toMatch(/^\\\\wsl\.localhost\\Ubuntu\\/)
    expect(d.warning).toBeNull()
  })

  it('creates a folder ("New folder"), plain names only, inside allowed roots', () => {
    _setWslInfoForTest(MAC)
    const ok = createFolder(HOME, 'my-agent')
    expect(ok.status).toBe(201)
    expect(fs.existsSync(path.join(HOME, 'my-agent'))).toBe(true)
    expect(createFolder(HOME, '../escape').status).toBe(400)
    expect(createFolder(HOME, 'a/b').status).toBe(400)
    expect(createFolder('/etc', 'x').status).toBe(403)
  })
})
