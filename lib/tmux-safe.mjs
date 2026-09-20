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

/** Run tmux with an argument vector. No shell is involved. */
export async function tmux(args, opts = {}) {
  return execFileAsync('tmux', args, { encoding: 'utf8', ...opts })
}

/** Synchronous sibling, for the paths that cannot be async. */
export function tmuxSync(args, opts = {}) {
  return execFileSync('tmux', args, { encoding: 'utf8', ...opts })
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
