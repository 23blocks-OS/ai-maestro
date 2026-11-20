/**
 * Crash restart (F044 item 6): what to do with an agent whose terminal is at a bare shell.
 *
 * A program that crashed leaves no SessionEnd behind: the last hook record is from a live session. A person
 * who quit (/exit, Ctrl-C twice, logout) leaves `ended`, and that agent is left alone. An agent the operator
 * hibernated has no terminal at all, so it never gets here.
 *
 * Restarts back off (30 s, 1, 2, 4, then 5 minutes); after MAX_RESTARTS within WINDOW_MS the agent is marked
 * failed and is not restarted again until its program runs again (a person starts it).
 */
export const WINDOW_MS = 30 * 60_000
export const MAX_RESTARTS = 6
/** The shell must be untouched this long: a person typing in the pane is never interrupted */
export const QUIET_MS = 60_000
const BACKOFF_MS = [0, 30_000, 60_000, 120_000, 240_000, 300_000]

export interface CrashInput {
  /** The pane holds a shell, not a program */
  atShell: boolean
  /** Last keystroke or output in the terminal (ms), when tmux says */
  lastActivityMs?: number
  /** The newest hook record for the agent's folder: status and when */
  record: { status: string; at: number } | null
  /** Earlier automatic restarts (ISO times) */
  restarts: string[]
  /** Already marked failed */
  failed: boolean
  now: number
}

export type CrashAction =
  | { action: 'none'; why: string }
  | { action: 'wait'; until: number }
  | { action: 'restart'; restarts: string[] }
  | { action: 'fail'; restarts: string[] }

export function crashAction(i: CrashInput): CrashAction {
  if (!i.atShell) return { action: 'none', why: 'the program is running' }
  if (i.failed) return { action: 'none', why: 'marked failed; a person starts it' }
  if (!i.record) return { action: 'none', why: 'no program ever reported from this folder' }
  if (i.record.status === 'ended') return { action: 'none', why: 'the program was quit on purpose' }
  if (i.lastActivityMs !== undefined && i.now - i.lastActivityMs < QUIET_MS) return { action: 'none', why: 'someone is using the shell' }
  const recent = i.restarts.filter(t => i.now - Date.parse(t) < WINDOW_MS).sort()
  if (recent.length >= MAX_RESTARTS) return { action: 'fail', restarts: recent }
  const last = recent.length ? Date.parse(recent[recent.length - 1]) : 0
  const until = last + BACKOFF_MS[Math.min(recent.length, BACKOFF_MS.length - 1)]
  if (recent.length && i.now < until) return { action: 'wait', until }
  return { action: 'restart', restarts: [...recent, new Date(i.now).toISOString()] }
}
