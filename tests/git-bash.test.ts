/**
 * F041: the bash that runs AI Maestro's shell scripts. On Windows it must be Git for Windows' bash, never
 * C:\\Windows\\System32\\bash.exe (WSL). Paths and environment are passed in, so this runs on any platform.
 */
import { describe, it, expect } from 'vitest'
import { gitBashPath, requireGitBash, scriptArgv } from '@/lib/git-bash.mjs'

const has = (...files: string[]) => (p: unknown) => files.map(f => f.toLowerCase()).includes(String(p).toLowerCase())
const win = (env: Record<string, string>, ...files: string[]) =>
  ({ platform: 'win32' as const, env: { SystemRoot: 'C:\\Windows', ...env } as unknown as NodeJS.ProcessEnv, exists: has(...files) })

describe('gitBashPath (F041)', () => {
  it('is /bin/bash on macOS and Linux', () => {
    expect(gitBashPath({ platform: 'darwin', exists: () => true })).toBe('/bin/bash')
    expect(gitBashPath({ platform: 'linux', exists: () => false })).toBe('bash')
  })

  it('finds the bash of the Git on PATH, never the WSL launcher in System32', () => {
    const opts = win({ Path: 'C:\\Windows\\System32;C:\\Program Files\\Git\\cmd' },
      'C:\\Windows\\System32\\bash.exe', 'C:\\Program Files\\Git\\cmd\\git.exe', 'C:\\Program Files\\Git\\bin\\bash.exe')
    expect(gitBashPath(opts)).toBe('C:\\Program Files\\Git\\bin\\bash.exe')
  })

  it('takes AIM_BASH, then Claude Code\'s CLAUDE_CODE_GIT_BASH_PATH, but not a WSL bash', () => {
    const files = ['D:\\PortableGit\\bin\\bash.exe', 'E:\\Git\\bin\\bash.exe', 'C:\\Windows\\System32\\bash.exe']
    expect(gitBashPath(win({ AIM_BASH: 'D:\\PortableGit\\bin\\bash.exe', CLAUDE_CODE_GIT_BASH_PATH: 'E:\\Git\\bin\\bash.exe' }, ...files))).toBe('D:\\PortableGit\\bin\\bash.exe')
    expect(gitBashPath(win({ CLAUDE_CODE_GIT_BASH_PATH: 'E:\\Git\\bin\\bash.exe' }, ...files))).toBe('E:\\Git\\bin\\bash.exe')
    expect(gitBashPath(win({ AIM_BASH: 'C:\\Windows\\System32\\bash.exe' }, ...files))).toBeNull()
  })

  it('falls back to the usual install folders, and is null without Git for Windows', () => {
    expect(gitBashPath(win({ LOCALAPPDATA: 'C:\\Users\\Bob\\AppData\\Local' }, 'C:\\Users\\Bob\\AppData\\Local\\Programs\\Git\\bin\\bash.exe')))
      .toBe('C:\\Users\\Bob\\AppData\\Local\\Programs\\Git\\bin\\bash.exe')
    expect(gitBashPath(win({ Path: 'C:\\Windows\\System32' }, 'C:\\Windows\\System32\\bash.exe'))).toBeNull()
    expect(() => requireGitBash(win({}, ))).toThrow(/Git for Windows is not installed/)
  })
})

describe('scriptArgv (F041)', () => {
  it('runs a script by its own #! line on macOS and Linux, and through Git Bash on Windows', () => {
    expect(scriptArgv('/u/.local/bin/amp-init.sh', ['--auto'], { platform: 'darwin' })).toEqual(['/u/.local/bin/amp-init.sh', '--auto'])
    expect(scriptArgv('C:\\u\\amp-init.sh', ['--auto'], win({ ProgramFiles: 'C:\\Program Files' }, 'C:\\Program Files\\Git\\bin\\bash.exe')))
      .toEqual(['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\u\\amp-init.sh', '--auto'])
  })
})
