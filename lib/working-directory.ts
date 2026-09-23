/**
 * Where an agent works: resolving and checking the folder a person gives when
 * creating an agent, with the Windows (WSL) cases spelled out.
 *
 * On Windows, AI Maestro runs inside WSL, a Linux system with its own disk.
 * Someone who installed WSL minutes ago sees an empty Linux home and naturally
 * wants the agent in a Windows folder (C:\Users\me\Projects, which WSL shows
 * as /mnt/c/Users/me/Projects). That works, but across the WSL boundary file
 * access is many times slower and file watching and git line endings misbehave.
 * So: a Windows path is translated and warned about, never silently stored as
 * text the shell cannot use, and the default is a folder inside Linux, with the
 * path Windows Explorer can open it at.
 *
 * Before this, an empty folder meant `process.cwd()` (the AI Maestro install
 * directory, while the UI said "home directory"), and a pasted C:\ path was
 * stored as the agent's working directory while tmux started it somewhere else.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

export interface WslInfo {
  isWsl: boolean
  /** e.g. "Ubuntu" */
  distro: string | null
}

let cachedWsl: WslInfo | null = null

/** Running inside WSL? (WSL_DISTRO_NAME is set, or the kernel says microsoft) */
export function wslInfo(): WslInfo {
  if (cachedWsl) return cachedWsl
  let isWsl = Boolean(process.env.WSL_DISTRO_NAME)
  if (!isWsl && process.platform === 'linux') {
    try { isWsl = /microsoft/i.test(fs.readFileSync('/proc/version', 'utf-8')) } catch { /* not WSL */ }
  }
  cachedWsl = { isWsl, distro: isWsl ? (process.env.WSL_DISTRO_NAME || 'Ubuntu') : null }
  return cachedWsl
}

/** For tests */
export function _setWslInfoForTest(info: WslInfo | null) { cachedWsl = info }

const WINDOWS_PATH = /^([A-Za-z]):[\\/](.*)$/
const WINDOWS_DRIVE_MOUNT = /^\/mnt\/([a-z])(\/|$)/

/** "C:\Users\me\Projects" → "/mnt/c/Users/me/Projects"; null if not a Windows path */
export function windowsToWslPath(p: string): string | null {
  const m = p.trim().match(WINDOWS_PATH)
  if (!m) return null
  const rest = m[2].replace(/\\/g, '/').replace(/\/+$/, '')
  return `/mnt/${m[1].toLowerCase()}${rest ? `/${rest}` : ''}`
}

/** A folder on a Windows drive, seen from WSL (/mnt/c/...) */
export function isWindowsDriveMount(p: string): boolean {
  return WINDOWS_DRIVE_MOUNT.test(p)
}

/**
 * Where Windows (Explorer, VS Code) can open a WSL folder:
 *   /home/me/agents/x → \\wsl.localhost\Ubuntu\home\me\agents\x
 *   /mnt/c/Users/me   → C:\Users\me
 */
export function windowsPathFor(linuxPath: string, distro: string | null): string | null {
  const m = linuxPath.match(/^\/mnt\/([a-z])(\/.*)?$/)
  if (m) return `${m[1].toUpperCase()}:${(m[2] || '\\').replace(/\//g, '\\')}`
  if (!distro || !linuxPath.startsWith('/')) return null
  return `\\\\wsl.localhost\\${distro}${linuxPath.replace(/\//g, '\\')}`
}

/** The folder an agent gets when none is chosen: ~/agents/<name> */
export function defaultAgentDirectory(agentName: string): string {
  return path.join(os.homedir(), 'agents', agentName)
}

export interface ResolvedWorkingDirectory {
  ok: boolean
  /** Absolute Linux path to use */
  cwd?: string
  /** Plain-language reason it cannot be used */
  error?: string
  /** Things the person should know, shown after creation */
  warnings: string[]
  /** Where Windows can open it, on WSL */
  windowsPath?: string | null
  /** The default folder was created for this agent */
  created?: boolean
}

export const WINDOWS_FOLDER_WARNING =
  'This is a Windows folder. Agents work much more slowly on Windows folders from WSL, and file watching and git can misbehave. ' +
  'For the best results keep the agent\'s files inside Linux (for example ~/agents/<name>); you can still open them from Windows Explorer.'

/**
 * Turn what the person typed (or nothing) into a folder the agent can work in.
 * Nothing → ~/agents/<name>, created. "~" is expanded. A Windows path is
 * translated to its WSL form. The folder must exist and be absolute.
 */
export function resolveWorkingDirectory(input: string | undefined | null, agentName: string, wsl: WslInfo = wslInfo()): ResolvedWorkingDirectory {
  const warnings: string[] = []
  let p = (input || '').trim()

  if (!p) {
    const dir = defaultAgentDirectory(agentName)
    let created = false
    try {
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); created = true }
    } catch (err) {
      return { ok: false, warnings, error: `Could not create the agent's folder ${dir}: ${(err as Error).message}` }
    }
    return { ok: true, cwd: dir, warnings, created, windowsPath: wsl.isWsl ? windowsPathFor(dir, wsl.distro) : null }
  }

  if (p === '~' || p.startsWith('~/')) p = path.join(os.homedir(), p.slice(1))

  const translated = windowsToWslPath(p)
  if (translated) {
    if (!wsl.isWsl && process.platform !== 'win32') {
      return { ok: false, warnings, error: `"${p}" is a Windows path, but AI Maestro is running on ${process.platform === 'darwin' ? 'macOS' : 'Linux'}. Use a folder on this machine.` }
    }
    warnings.push(`"${p}" is a Windows path; using its WSL form ${translated}.`)
    p = translated
  }

  if (!path.isAbsolute(p)) {
    return { ok: false, warnings, error: `"${p}" is not a full path. Use a path starting with / (or ~), or leave it empty to use ~/agents/${agentName}.` }
  }
  p = path.resolve(p)

  let stat: fs.Stats | null = null
  try { stat = fs.statSync(p) } catch { /* missing */ }
  if (!stat) {
    return { ok: false, warnings, error: `The folder ${p} does not exist. Create it first, pick another, or leave it empty to use ~/agents/${agentName}.` }
  }
  if (!stat.isDirectory()) {
    return { ok: false, warnings, error: `${p} is a file, not a folder.` }
  }

  if (wsl.isWsl && isWindowsDriveMount(p)) warnings.push(WINDOWS_FOLDER_WARNING.replace('<name>', agentName))

  return { ok: true, cwd: p, warnings, windowsPath: wsl.isWsl ? windowsPathFor(p, wsl.distro) : null }
}
