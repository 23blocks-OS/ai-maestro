/**
 * The bash that runs AI Maestro's shell scripts (F041).
 *
 * macOS and Linux: /bin/bash. Native Windows: Git for Windows' bash, the one Claude Code's own Bash tool
 * runs. Never the `bash` that Windows puts on PATH (C:\Windows\System32\bash.exe): that one starts WSL, so a
 * script would run inside a Linux distribution with other files, other tools and another home folder.
 *
 * Order on Windows: AIM_BASH, then CLAUDE_CODE_GIT_BASH_PATH (Claude Code's own setting), then the Git that is
 * on PATH (git.exe sits in <root>\cmd or <root>\bin, bash in <root>\bin), then the usual install folders.
 */
import fs from 'fs'
import path from 'path'

const isWsl = (p, env) => {
  const sys = (env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows').toLowerCase()
  const lower = p.toLowerCase()
  return lower.startsWith(path.win32.join(sys, 'system32').toLowerCase()) || lower.includes('\\windowsapps\\')
}

/** Git for Windows' bash.exe, or null when Git for Windows is not installed. */
export function gitBashPath({ platform = process.platform, env = process.env, exists = fs.existsSync } = {}) {
  if (platform !== 'win32') return exists('/bin/bash') ? '/bin/bash' : 'bash'
  const ok = (p) => Boolean(p) && path.win32.isAbsolute(p) && !isWsl(p, env) && exists(p)
  for (const name of ['AIM_BASH', 'CLAUDE_CODE_GIT_BASH_PATH']) {
    if (ok(env[name])) return env[name]
  }
  const dirs = (env.Path || env.PATH || '').split(';').filter(Boolean)
  for (const dir of dirs) {
    if (!exists(path.win32.join(dir, 'git.exe'))) continue
    // <root>\cmd\git.exe, <root>\bin\git.exe or <root>\mingw64\bin\git.exe
    for (const root of [path.win32.dirname(dir), path.win32.dirname(path.win32.dirname(dir))]) {
      const bash = path.win32.join(root, 'bin', 'bash.exe')
      if (ok(bash)) return bash
    }
  }
  const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, 'Programs')]
  for (const root of roots.filter(Boolean)) {
    const bash = path.win32.join(root, 'Git', 'bin', 'bash.exe')
    if (ok(bash)) return bash
  }
  return null
}

/** gitBashPath(), or an Error that says what to install. */
export function requireGitBash(opts) {
  const bash = gitBashPath(opts)
  if (!bash) throw new Error('Git for Windows is not installed, so the AI Maestro scripts cannot run. Install it from https://git-scm.com/download/win (or: winget install Git.Git), or set AIM_BASH to its bin\\bash.exe.')
  return bash
}

/**
 * argv for running a shell script: [bash, script, ...args] where the script cannot run on its own (Windows),
 * else [script, ...args] (its own #! line), so macOS and Linux run exactly what they ran before.
 */
export function scriptArgv(script, args = [], opts = {}) {
  const platform = opts.platform ?? process.platform
  if (platform !== 'win32') return [script, ...args]
  return [requireGitBash(opts), script, ...args]
}
