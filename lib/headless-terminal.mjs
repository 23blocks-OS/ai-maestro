/**
 * Headless Terminal Bridge (ESM) — server-side xterm.js for lossless state capture.
 *
 * Each PTY session gets a headless xterm.js instance that receives all PTY data.
 * On client connect, we serialize the full terminal state (scrollback, cursor,
 * colors, alternate screen) and send it instead of tmux capture-pane.
 *
 * This is the same approach VS Code uses for remote terminal reconnection.
 */

import xtermHeadless from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'

const { Terminal } = xtermHeadless

const headlessTerminals = new Map()

/**
 * Create or get a headless terminal for a session.
 * Matches the PTY dimensions so the terminal state is accurate.
 */
export function getOrCreateHeadlessTerminal(sessionName, cols = 80, rows = 24) {
  let entry = headlessTerminals.get(sessionName)
  if (entry) {
    if (entry.terminal.cols !== cols || entry.terminal.rows !== rows) {
      entry.terminal.resize(cols, rows)
    }
    return entry
  }

  const terminal = new Terminal({
    cols,
    rows,
    scrollback: 10000,
    allowProposedApi: true,
  })

  const serializeAddon = new SerializeAddon()
  terminal.loadAddon(serializeAddon)

  entry = { terminal, serializeAddon }
  headlessTerminals.set(sessionName, entry)
  console.log(`[HeadlessTerm] Created for ${sessionName} (${cols}x${rows})`)
  return entry
}

/**
 * Write PTY data into the headless terminal.
 * Call this from every ptyProcess.onData handler.
 */
export function writeToHeadlessTerminal(sessionName, data) {
  const entry = headlessTerminals.get(sessionName)
  if (entry) {
    entry.terminal.write(data)
  }
}

/**
 * Serialize the full terminal state for sending to a client.
 * Returns a string that the client can load via SerializeAddon.
 */
export function serializeTerminalState(sessionName) {
  const entry = headlessTerminals.get(sessionName)
  if (!entry) return null

  try {
    return entry.serializeAddon.serialize({
      scrollback: 10000,
    })
  } catch (e) {
    console.error(`[HeadlessTerm] Failed to serialize ${sessionName}:`, e.message)
    return null
  }
}

/**
 * Resize the headless terminal (call when PTY is resized).
 */
export function resizeHeadlessTerminal(sessionName, cols, rows) {
  const entry = headlessTerminals.get(sessionName)
  if (entry) {
    entry.terminal.resize(cols, rows)
  }
}

/**
 * Dispose and remove a headless terminal (call on session cleanup).
 */
export function disposeHeadlessTerminal(sessionName) {
  const entry = headlessTerminals.get(sessionName)
  if (entry) {
    try { entry.terminal.dispose() } catch {}
    headlessTerminals.delete(sessionName)
    console.log(`[HeadlessTerm] Disposed for ${sessionName}`)
  }
}
