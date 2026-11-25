/**
 * The shell in an agent's pane, and the lines AI Maestro types into it (F041, native Windows).
 *
 * An agent starts by typing a command line into its tmux pane: set AMP_DIR and the agent's name, unset
 * CLAUDECODE, then the program with its arguments and environment. On macOS and Linux that shell is POSIX
 * (bash, zsh). On native Windows the multiplexer is psmux, and a POSIX line typed into PowerShell fails:
 * `export`, `unset`, `&&` and `VAR=1 cmd` are all errors there, the program never starts, and the agent's
 * role prompt is then typed into PowerShell as commands (seen on Windows 11 with psmux 3.4.0).
 *
 * So the pane's shell is fixed per platform (PowerShell on Windows: every Windows 10 and 11 has
 * powershell.exe; psmux would otherwise inherit cmd or PowerShell from whoever started its server), and every
 * line is written for that shell here, in one place.
 */

export type PaneShell = 'posix' | 'powershell'

/** The shell AI Maestro starts in a pane on this platform. */
export function paneShell(platform: NodeJS.Platform = process.platform): PaneShell {
  return platform === 'win32' ? 'powershell' : 'posix'
}

/**
 * The program a new session runs, after `new-session ... --`. Empty on POSIX: tmux starts the user's shell,
 * as before. On Windows, interactive Windows PowerShell with the user's profile (as tmux reads ~/.bashrc), with
 * the RemoteSigned execution policy for this process: Windows' default (Restricted) refuses every .ps1, and
 * PowerShell runs the .ps1 shim npm writes for a program (codex.ps1) before its .cmd, so an agent whose program
 * came from npm would not start. RemoteSigned runs local scripts and still refuses unsigned downloaded ones.
 */
export function paneShellArgv(platform: NodeJS.Platform = process.platform): string[] {
  return platform === 'win32' ? ['powershell.exe', '-NoLogo', '-ExecutionPolicy', 'RemoteSigned'] : []
}

/** One value as a single-quoted word. Both shells take single quotes literally; only the escape differs. */
export function quote(shell: PaneShell, value: string): string {
  const v = String(value)
  return shell === 'powershell' ? `'${v.replace(/'/g, "''")}'` : `'${v.replace(/'/g, `'\\''`)}'`
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
function assertEnvName(name: string): string {
  if (!ENV_NAME.test(name)) throw new Error(`Invalid environment variable name: ${JSON.stringify(name).slice(0, 60)}`)
  return name
}

/** Set variables for the rest of the shell session: `export A='x' B='y'` / `$env:A='x'; $env:B='y'`. */
export function setEnv(shell: PaneShell, vars: Record<string, string>): string {
  const entries = Object.entries(vars)
  if (entries.length === 0) return ''
  if (shell === 'powershell') return entries.map(([k, v]) => `$env:${assertEnvName(k)}=${quote(shell, v)}`).join('; ')
  return 'export ' + entries.map(([k, v]) => `${assertEnvName(k)}=${quote(shell, v)}`).join(' ')
}

/** Remove a variable: `unset NAME` / `Remove-Item Env:NAME` (silent when it is not set). */
export function unsetEnv(shell: PaneShell, name: string): string {
  assertEnvName(name)
  return shell === 'powershell' ? `Remove-Item Env:${name} -ErrorAction SilentlyContinue` : `unset ${name}`
}

/**
 * Variables for the command that follows. POSIX scopes `A='x' cmd` to that command; PowerShell has no such
 * form, so it sets them for the session (`$env:A='x'; cmd`), which is the same thing in a pane that only
 * ever runs this one program. Returns a prefix ending in a space (or ''), like the strings it replaces.
 */
export function envPrefix(shell: PaneShell, vars: Record<string, string>): string {
  const entries = Object.entries(vars)
  if (entries.length === 0) return ''
  if (shell === 'powershell') return setEnv(shell, vars) + '; '
  return entries.map(([k, v]) => `${assertEnvName(k)}=${quote(shell, v)}`).join(' ') + ' '
}

/**
 * A program and its arguments, built as plain words for POSIX, made safe for the pane's shell. POSIX: unchanged.
 * PowerShell reads more characters as syntax: a comma makes an array (`--tools a,b` passes two arguments), `@`
 * and `#` start a splat or a comment, braces a script block, and `~` is not expanded in a program's arguments.
 * So on PowerShell every word with anything but letters, digits and `_ . : / \\ = + -` is single-quoted, a word
 * already in single quotes is kept, `~/x` becomes "$HOME/x", and a quoted program gets the call operator `&`.
 */
export function commandWords(shell: PaneShell, line: string): string {
  if (shell !== 'powershell') return line
  const SAFE = /^[A-Za-z0-9_.:/\\=+-]+$/
  const words = line.split(' ').filter(Boolean)
  const out = words.map((w) => {
    if (SAFE.test(w) || /^'[^']*'$/.test(w)) return w
    if (/^~[\\/]/.test(w) && (w.length === 2 || SAFE.test(w.slice(2)))) return `"$HOME${w.slice(1)}"`
    return quote(shell, w)
  })
  if (out.length > 0 && out[0] !== words[0]) out[0] = `& ${out[0]}`
  return out.join(' ')
}

/** Commands run one after another, whatever each returns. Empty parts are dropped. */
export function sequence(_shell: PaneShell, parts: string[]): string {
  return parts.map(p => p.trim().replace(/;$/, '')).filter(Boolean).join('; ')
}

/**
 * The agent's environment line, typed before its program: AMP_DIR and the agent's name and id, and CLAUDECODE
 * removed so Claude Code does not think it is nested inside another Claude Code.
 */
export function agentEnvLine(shell: PaneShell, vars: { AMP_DIR?: string; AIM_AGENT_NAME?: string; AIM_AGENT_ID?: string }): string {
  const set: Record<string, string> = {}
  for (const [k, v] of Object.entries(vars)) if (v) set[k] = v
  // The AMP scripts run in Git Bash on Windows: C:/Users/... reads the same there and in Windows programs
  if (shell === 'powershell' && set.AMP_DIR) set.AMP_DIR = set.AMP_DIR.replace(/\\/g, '/')
  return sequence(shell, [setEnv(shell, set), unsetEnv(shell, 'CLAUDECODE')])
}
