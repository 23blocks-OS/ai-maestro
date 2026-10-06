/**
 * tmux operations shared by server.mjs (plain ESM) and lib/agent-runtime.ts.
 *
 * F026 Phase 0. server.mjs cannot import TypeScript at module load, so the
 * operations it needs live here, in one place, and TmuxRuntime delegates to the
 * same functions for its matching methods. Each operation builds its argv in
 * exactly one function (`argv.*` below), and the sync and async runners both use
 * that builder, so the two callers cannot drift apart.
 *
 * Every call goes through lib/tmux-safe.mjs: execFile with an argument vector,
 * no shell, and the target validated here, at the choke point:
 *   - session-level operations (has/new/kill session, set-option on a session,
 *     the attach command) use assertSessionName, ^[a-zA-Z0-9_-]{1,128}$;
 *   - pane-level operations (capture, send-keys, paste, copy-mode) use
 *     assertPaneTarget, which is the same alphabet plus an optional `:W.P`.
 * A bad name throws InvalidSessionNameError / InvalidPaneTargetError before tmux
 * runs. Callers that used to swallow tmux errors swallow these the same way.
 *
 * The argument ORDER of each builder is the order the old shell strings in
 * server.mjs used, on purpose: Phase 0 must not change what tmux receives.
 *
 * `socketPath` (the /term `socket` query parameter, for agents on a custom tmux
 * server) becomes `-S <path>` before the command, as one argv entry.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  tmux,
  tmuxSync,
  assertSessionName,
  assertPaneTarget,
} from './tmux-safe.mjs'

/**
 * @typedef {{ socketPath?: string, timeout?: number }} AsyncOpts
 */

/** tmux buffer names we create: `aimaestro-<ms>` and `aimaestro-<ms>-r`. */
export const BUFFER_NAME_RE = /^[a-zA-Z0-9_-]{1,128}$/

export function assertBufferName(name) {
  if (typeof name !== 'string' || !BUFFER_NAME_RE.test(name)) {
    const err = new Error(`Invalid tmux buffer name: ${JSON.stringify(String(name)).slice(0, 80)}`)
    err.code = 'INVALID_BUFFER_NAME'
    throw err
  }
  return name
}

function withSocket(args, socketPath) {
  return socketPath ? ['-S', socketPath, ...args] : args
}

// ---------------------------------------------------------------------------
// argv builders: the single definition of what each operation sends to tmux
// ---------------------------------------------------------------------------

export const argv = {
  hasSession: (name) => ['has-session', '-t', assertSessionName(name)],
  newSession: (name, cwd) => ['new-session', '-d', '-s', assertSessionName(name), '-c', cwd],
  killSession: (name) => ['kill-session', '-t', assertSessionName(name)],
  listSessionNames: () => ['list-sessions', '-F', '#{session_name}'],

  /** `capture-pane -p [-J] -t T -S -N` (plain text, the readback shape). */
  capturePane: (target, lines, { join = false } = {}) => [
    'capture-pane', '-p', ...(join ? ['-J'] : []), '-t', assertPaneTarget(target), '-S', `-${lines}`,
  ],
  /** `capture-pane -t T -p -e [-S -N]` (with escapes, for the dim-text check). */
  capturePaneRaw: (target, lines) => [
    'capture-pane', '-t', assertPaneTarget(target), '-p', '-e', ...(lines == null ? [] : ['-S', `-${lines}`]),
  ],
  /** `capture-pane -t T -e -p -S -N` (history replay sent to a new terminal client). */
  captureHistory: (target, lines) => [
    'capture-pane', '-t', assertPaneTarget(target), '-e', '-p', '-S', `-${lines}`,
  ],

  paneInMode: (target) => ['display-message', '-p', '-t', assertPaneTarget(target), '#{pane_in_mode}'],

  /** One key (or key name) with no flags: `send-keys -t T KEY`. */
  sendKey: (target, key) => ['send-keys', '-t', assertPaneTarget(target), key],
  /** Literal text, one argv entry: `send-keys -t T -l TEXT`. */
  sendLiteral: (target, text) => ['send-keys', '-t', assertPaneTarget(target), '-l', text],
  /** The same key N times: `send-keys -t T -N N KEY`. */
  repeatKey: (target, key, count) => ['send-keys', '-t', assertPaneTarget(target), '-N', String(count), key],

  loadBuffer: (buffer, file) => ['load-buffer', '-b', assertBufferName(buffer), file],
  /** `-d` deletes the buffer after pasting, `-r` keeps LF (no CR translation). */
  pasteBuffer: (target, buffer) => ['paste-buffer', '-d', '-r', '-b', assertBufferName(buffer), '-t', assertPaneTarget(target)],
  deleteBuffer: (buffer) => ['delete-buffer', '-b', assertBufferName(buffer)],

  /** `-e`: leave copy-mode automatically when scrolled back to the bottom. */
  enterCopyMode: (target) => ['copy-mode', '-e', '-t', assertPaneTarget(target)],
  cancelCopyMode: (target) => ['send-keys', '-t', assertPaneTarget(target), '-X', 'cancel'],
  scroll: (target, direction, lines) => [
    'send-keys', '-t', assertPaneTarget(target), '-X', '-N', String(lines), direction === 'up' ? 'scroll-up' : 'scroll-down',
  ],

  /** `set-option [-w] -t S OPTION VALUE`. */
  setOption: (name, option, value, { window = false } = {}) => [
    'set-option', ...(window ? ['-w'] : []), '-t', assertSessionName(name), option, value,
  ],
}

/**
 * The command node-pty spawns to show a session in a terminal. The runtime does
 * not own the PTY; it only says how to attach.
 *
 * @param {string} name
 * @param {{ socketPath?: string, readOnly?: boolean }} [opts]
 */
export function attachCommand(name, { socketPath, readOnly = false } = {}) {
  const args = ['attach-session', '-t', assertSessionName(name), ...(readOnly ? ['-r'] : [])]
  return { command: 'tmux', args: withSocket(args, socketPath) }
}

// ---------------------------------------------------------------------------
// Synchronous operations (server.mjs paths that are synchronous today)
// ---------------------------------------------------------------------------

/**
 * True when the session exists. Never throws (a bad name is "does not exist").
 * @param {string} name
 * @param {{ socketPath?: string, timeout?: number }} [opts]
 */
export function hasSessionSync(name, { socketPath, timeout = 2000 } = {}) {
  try {
    tmuxSync(withSocket(argv.hasSession(name), socketPath), { stdio: 'ignore', timeout })
    return true
  } catch {
    return false
  }
}

export function newSessionSync(name, cwd, { timeout = 5000 } = {}) {
  tmuxSync(argv.newSession(name, cwd), { timeout })
}

export function killSessionSync(name, { timeout = 5000 } = {}) {
  tmuxSync(argv.killSession(name), { stdio: 'ignore', timeout })
}

/** Every session name, from tmux's own output. Throws when no server runs. */
export function listSessionNamesSync({ timeout = 5000 } = {}) {
  const out = tmuxSync(argv.listSessionNames(), { timeout, stdio: ['pipe', 'pipe', 'ignore'] })
  return out.trim().split('\n')
}

/**
 * Plain capture. Throws on failure; callers keep their own fallbacks.
 * @param {string} target
 * @param {number} lines
 * @param {{ join?: boolean, timeout?: number }} [opts]
 * @returns {string}
 */
export function capturePaneSync(target, lines, { join = false, timeout = 2000 } = {}) {
  return tmuxSync(argv.capturePane(target, lines, { join }), { timeout })
}

/**
 * Capture WITH escapes. Replaces the shell form
 *   `capture-pane -t T -p -e -S -N 2>/dev/null || capture-pane -t T -p -e`
 * with the same two calls, the first one's stderr discarded. Throws only if
 * both fail.
 */
export function capturePaneRawSync(target, lines = 200, { timeout = 3000 } = {}) {
  try {
    return tmuxSync(argv.capturePaneRaw(target, lines), { timeout, stdio: ['pipe', 'pipe', 'ignore'] })
  } catch (err) {
    if (err && (err.code === 'INVALID_PANE_TARGET' || err.code === 'INVALID_SESSION_NAME')) throw err
    return tmuxSync(argv.capturePaneRaw(target, null), { timeout })
  }
}

/** '1' while the pane is in copy-mode (or another mode), '0' otherwise. */
export function paneInModeSync(target, { timeout = 2000 } = {}) {
  return tmuxSync(argv.paneInMode(target), { timeout }).trim()
}

/**
 * Leave copy-mode if the pane is in it. While in copy-mode a paste shows but
 * Enter is eaten by copy-mode instead of submitting. Best effort, never throws.
 */
export function exitCopyModeSync(target, { timeout = 2000 } = {}) {
  try {
    if (paneInModeSync(target, { timeout }) === '1') {
      tmuxSync(argv.cancelCopyMode(target), { timeout })
    }
  } catch { /* best effort */ }
}

export function sendKeySync(target, key, { timeout = 3000 } = {}) {
  tmuxSync(argv.sendKey(target, key), { timeout })
}

export function sendLiteralSync(target, text, { timeout = 3000 } = {}) {
  tmuxSync(argv.sendLiteral(target, text), { timeout })
}

export function repeatKeySync(target, key, count, { timeout = 3000 } = {}) {
  tmuxSync(argv.repeatKey(target, key, count), { timeout })
}

export function loadBufferSync(buffer, file, { timeout = 3000 } = {}) {
  tmuxSync(argv.loadBuffer(buffer, file), { timeout })
}

export function pasteBufferSync(target, buffer, { timeout = 3000 } = {}) {
  tmuxSync(argv.pasteBuffer(target, buffer), { timeout })
}

export function deleteBufferSync(buffer, { timeout = 1000 } = {}) {
  tmuxSync(argv.deleteBuffer(buffer), { timeout })
}

// ---------------------------------------------------------------------------
// Asynchronous operations (never block the event loop)
// ---------------------------------------------------------------------------

/**
 * @param {string} target
 * @param {string} key
 * @param {AsyncOpts} [opts]
 */
export async function sendKeyAsync(target, key, { socketPath, timeout = 5000 } = {}) {
  await tmux(withSocket(argv.sendKey(target, key), socketPath), { timeout })
}

/**
 * @param {string} target
 * @param {string} text
 * @param {AsyncOpts} [opts]
 */
export async function sendLiteralAsync(target, text, { socketPath, timeout = 5000 } = {}) {
  await tmux(withSocket(argv.sendLiteral(target, text), socketPath), { timeout })
}

/**
 * @param {string} name
 * @param {AsyncOpts} [opts]
 */
export async function killSessionAsync(name, { socketPath, timeout = 5000 } = {}) {
  await tmux(withSocket(argv.killSession(name), socketPath), { timeout })
}

/**
 * @param {string} name
 * @param {string} option
 * @param {string} value
 * @param {{ window?: boolean, socketPath?: string, timeout?: number }} [opts]
 */
export async function setOptionAsync(name, option, value, { window = false, socketPath, timeout = 2000 } = {}) {
  await tmux(withSocket(argv.setOption(name, option, value, { window }), socketPath), { timeout })
}

/**
 * History replay for a newly attached terminal: up to `lines` of scrollback, with escapes.
 * @param {string} target
 * @param {number} [lines]
 * @param {{ socketPath?: string, timeout?: number, maxBuffer?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function captureHistoryAsync(target, lines = 5000, { socketPath, timeout = 3000, maxBuffer = 32 * 1024 * 1024 } = {}) {
  const { stdout } = await tmux(withSocket(argv.captureHistory(target, lines), socketPath), { timeout, maxBuffer })
  return stdout
}

/**
 * @param {string} target
 * @param {AsyncOpts} [opts]
 */
export async function enterCopyModeAsync(target, { socketPath, timeout = 2000 } = {}) {
  await tmux(withSocket(argv.enterCopyMode(target), socketPath), { timeout })
}

/**
 * Scroll inside copy-mode. Outside copy-mode tmux refuses, harmlessly.
 * @param {string} target
 * @param {'up'|'down'} direction
 * @param {number|string} lines
 * @param {AsyncOpts} [opts]
 */
export async function scrollAsync(target, direction, lines, { socketPath, timeout = 2000 } = {}) {
  await tmux(withSocket(argv.scroll(target, direction, lines), socketPath), { timeout })
}

/**
 * Put text into the pane through a tmux paste buffer, the way the chat sends:
 * write a temp file, load-buffer, paste-buffer -d -r. Unlike send-keys -l the
 * text arrives as one paste, so a TUI does not see each line as a keypress.
 * Does NOT press Enter.
 *
 * @param {string} target
 * @param {string} text
 * @param {{ bufferName?: string, tmpDir?: string, timeout?: number }} [opts]
 */
export async function pasteTextAsync(target, text, { bufferName, tmpDir, timeout = 3000 } = {}) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const buffer = bufferName || `aimaestro-${stamp}`
  const file = path.join(tmpDir || os.tmpdir(), `aimaestro-paste-${stamp}.txt`)
  assertPaneTarget(target)
  assertBufferName(buffer)
  fs.writeFileSync(file, text, 'utf-8')
  try {
    await tmux(argv.loadBuffer(buffer, file), { timeout })
    await tmux(argv.pasteBuffer(target, buffer), { timeout })
  } catch (err) {
    try { await tmux(argv.deleteBuffer(buffer), { timeout: 1000 }) } catch { /* already gone */ }
    throw err
  } finally {
    try { fs.unlinkSync(file) } catch { /* already gone */ }
  }
}
