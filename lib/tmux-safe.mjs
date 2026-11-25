/**
 * Safe tmux invocation.
 *
 * SECURITY (GHSA-2vm8-3q4q-wqv3, and the incomplete patch for CVE-2026-37751 /
 * GHSA-mf7j-vfrr-jmfh that preceded it).
 *
 * tmux calls used to be built as SHELL STRINGS with the session name
 * interpolated into them:
 *
 *     await execAsync(`tmux has-session -t "${name}" 2>/dev/null`)
 *
 * The double quotes look like protection and are not: a name containing `$(…)`
 * or a backtick is still evaluated by the shell. `GET /api/sessions/[id]/command`
 * passes its URL path segment straight into that call, unauthenticated, and the
 * server binds 0.0.0.0:23000 by default — so one request executed arbitrary
 * commands as the server user. The existence check runs before any session
 * lookup, so exploitation needed neither a real session nor a real agent.
 *
 * The earlier fix converted the SYNC deletion path (`killSessionSync`) to
 * argument-array execution and added validation at agent-creation time. It left
 * the async path and every other tmux call alone, which is exactly how the
 * bypass was found. So this module takes the whole class out at once:
 *
 *   1. NO SHELL, ANYWHERE. execFile with an argument vector. A name is one
 *      argv entry; there is no parser left to confuse.
 *   2. VALIDATE AT THE CHOKE POINT, not at the routes. Route-level validation is
 *      what was tried before and it missed a route. Every helper here rejects a
 *      malformed session name, so a new caller cannot reintroduce this.
 *
 * Both layers are deliberate. Either alone would close today's report; together
 * they close the next one too.
 */

import { execFile, execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * tmux's own constraint, which the app already documents: session names are
 * alphanumerics, hyphen and underscore. Anything else was never valid — it
 * could only ever have been an attempt to reach the shell. The 128 ceiling
 * keeps a pathological name out of argv.
 */
export const SESSION_NAME_RE = /^[a-zA-Z0-9_-]{1,128}$/

export function isValidSessionName(name) {
  return typeof name === 'string' && SESSION_NAME_RE.test(name)
}

export class InvalidSessionNameError extends Error {
  constructor(name) {
    super(`Invalid tmux session name: ${JSON.stringify(String(name)).slice(0, 80)}`)
    this.name = 'InvalidSessionNameError'
    this.code = 'INVALID_SESSION_NAME'
  }
}

export function assertSessionName(name) {
  if (!isValidSessionName(name)) throw new InvalidSessionNameError(name)
  return name
}

/**
 * A pane target: a session name, optionally followed by `:window` or
 * `:window.pane` as plain digits (`agent:0.0`). The notification path pins the
 * first pane of the first window this way so a multi-pane session cannot
 * receive the text in the wrong place.
 *
 * Only the pane-level helpers accept this. Session-level calls (has-session,
 * new-session, kill-session, set-environment) keep `assertSessionName`: they
 * name a session, and a target there would mean something else.
 *
 * It is the SAME alphabet as a session name plus one `:` and one `.`, each
 * followed by digits and nothing else, anchored at both ends. Nothing a shell
 * or tmux would read as an option, a format or a second command can pass.
 * The pane methods used to run `assertSessionName` on this string, which
 * rejected every `agent:0.0` the notification code built, so the push into
 * the pane silently never happened.
 */
export const PANE_TARGET_RE = /^[a-zA-Z0-9_-]{1,128}(?::[0-9]{1,4}(?:\.[0-9]{1,4})?)?$/

export function isValidPaneTarget(target) {
  return typeof target === 'string' && PANE_TARGET_RE.test(target)
}

export class InvalidPaneTargetError extends Error {
  constructor(target) {
    super(`Invalid tmux pane target: ${JSON.stringify(String(target)).slice(0, 80)}`)
    this.name = 'InvalidPaneTargetError'
    this.code = 'INVALID_PANE_TARGET'
  }
}

export function assertPaneTarget(target) {
  if (!isValidPaneTarget(target)) throw new InvalidPaneTargetError(target)
  return target
}

/**
 * Every tmux call ends within this unless the caller asks for longer. Without it a stalled tmux
 * left one child per request alive, and requests kept arriving (incident 2026-10-29).
 */
export const TMUX_TIMEOUT_MS = 10_000

/**
 * A target as tmux must read it: the session by its EXACT name. tmux reads a bare name as a prefix
 * ("ai-maestro" reached the session "ai-maestro-app") and an empty target as the session used last,
 * so a reply for an agent that has no terminal was typed into another agent's (2026-10-30). Pane ids
 * (%3), window ids (@1) and session ids ($2) are left as they are. Checked against tmux 3.6a.
 */
export function exactTarget(target) {
  const t = String(target ?? '')
  if (!t || t.startsWith(':') || t.startsWith('.')) throw new InvalidSessionNameError(t)
  if (/^[%@$]/.test(t)) return t
  const exact = t.startsWith('=') ? t : `=${t}`
  // "=name" alone resolves for session commands but not for pane commands (capture-pane, send-keys,
  // paste-buffer find no pane); "=name:" resolves for both, and fails for both when the session is missing
  return exact.includes(':') ? exact : `${exact}:`
}

/**
 * Commands whose target is a whole session and that must get "=name" with no window part.
 * psmux 3.4 (native Windows, F041) refuses to kill a session named "=name:" or "=name:0": it answers
 * "still present after 5s" and the session stays, so hibernate never stopped anything. "=name" is
 * tmux's own exact form for a session and works on both (tmux 3.5a, psmux 3.4.0; F045 self-check).
 */
const SESSION_ONLY_COMMANDS = new Set(['kill-session'])

/** The tmux command in an argv, after global options such as "-S path" or "-L name". */
function subcommandOf(args) {
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i])
    if (a === '-S' || a === '-L' || a === '-f') { i++; continue }
    if (a.startsWith('-')) continue
    return a
  }
  return ''
}

/** Every `-t <target>` in an argument vector, made exact (see exactTarget) */
export function exactTargets(args) {
  const out = [...args]
  const sessionOnly = SESSION_ONLY_COMMANDS.has(subcommandOf(out))
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== '-t') continue
    if (i + 1 >= out.length) throw new InvalidSessionNameError('')
    const exact = exactTarget(out[i + 1])
    out[i + 1] = sessionOnly && /^=[^:]+:$/.test(exact) ? exact.slice(0, -1) : exact
  }
  return out
}

/**
 * windowsHide: on native Windows (psmux, F041) every tmux call is a console program, and without it each one
 * opens a console window for a moment: the session poll made windows flash on screen (lolad hit the same).
 * Ignored on other platforms.
 */

/** Run tmux with an argument vector. No shell is involved; every target is matched exactly. */
export async function tmux(args, opts = {}) {
  return execFileAsync('tmux', exactTargets(args), { encoding: 'utf8', timeout: TMUX_TIMEOUT_MS, windowsHide: true, ...opts })
}

/** Synchronous sibling, for the paths that cannot be async. */
export function tmuxSync(args, opts = {}) {
  return execFileSync('tmux', exactTargets(args), { encoding: 'utf8', timeout: TMUX_TIMEOUT_MS, windowsHide: true, ...opts })
}

/**
 * The full path of a program on PATH. node-pty on Windows does not apply PATHEXT, so "psmux" or
 * "tmux" fails with "File not found" while "psmux.exe" works; execFile finds both.
 */
export function resolveExecutable(bin, { platform = process.platform, env = process.env } = {}) {
  if (platform !== 'win32' || /[\\/]/.test(bin)) return bin
  const exts = path.extname(bin) ? [''] : (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
  const dirs = (env.Path || env.PATH || '').split(';').filter(Boolean)
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, bin + ext)
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return bin
}

/**
 * Translate a legacy non-literal key spec into argv entries.
 *
 * Callers pass tmux key sequences the way the shell used to receive them, so
 * `'"unset CLAUDECODE"'` meant ONE argument whose quotes the shell stripped,
 * while `'C-c'` and `'exit Enter'` meant one and two. Reproducing that here
 * keeps every existing caller working with no shell present.
 *
 * It also quietly closes a second hole: those strings were interpolated INTO a
 * shell double-quoted context, so a `$(…)` inside one — e.g. in a start command
 * or an agent argument — was executed. Now it is just text.
 */
export function splitKeySpec(keys) {
  const s = String(keys)
  // Exactly one quoted group, wrapping the whole string — the only shape any
  // caller actually uses, and the only one whose shell meaning is unambiguous.
  // A string with more quotes than that (`"a" "b"`) is left to word-splitting
  // rather than guessed at: quietly mis-joining key sequences would be a worse
  // failure than a visible one.
  const quotes = (s.match(/"/g) || []).length
  if (quotes === 2 && s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return [s.slice(1, -1)]
  }
  const parts = s.split(/\s+/).filter(Boolean)
  return parts.length > 0 ? parts : ['']
}
