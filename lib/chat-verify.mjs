/**
 * Prove a message was SUBMITTED to a TUI pane, and recover once if it was not.
 *
 * ONE implementation, used by both send paths:
 *
 *   - `server.mjs sendChatMessage`            — what the chat UI calls
 *   - `services/agents-chat-service.ts`       — what the REST endpoint calls
 *
 * The two wrappers stay separate on purpose: one resolves an agent from the
 * registry and guards against a bare shell, the other handles tmux copy-mode and
 * the permission cache. Different inputs, different concerns. What was duplicated
 * is *this* — the poll/detect/clear/retype loop, written twice on 15 Sep 2026 and
 * therefore fixable in only one of them at a time.
 *
 * Delivery is injected rather than assumed. The chat path pastes through a tmux
 * buffer (handles newlines and quoting for free); the service path types with
 * send-keys through the runtime abstraction that its tests mock. Both are
 * legitimate, so the shared part is the proof, not the typing.
 */

import { paneSubmitted, paneSubmittedPrefix, paneStaged, paneInputEmpty, stripDimPlaceholder, clearInputPlan } from './pane-readback.mjs'

/** ~3s per attempt: a TUI can take a moment to echo a submitted prompt. */
export const VERIFY_POLLS = 12
export const POLL_INTERVAL_MS = 250
/** One retry. If a dialog is holding the keyboard, a third attempt will not help. */
export const MAX_SENDS = 2

export const NOT_SUBMITTED_MESSAGE =
  "Your message reached the agent's input box but was never submitted — something in " +
  'the terminal is holding the keyboard, usually a prompt or dialog waiting for an ' +
  "answer. Open this agent's terminal, clear whatever is waiting, and send again."

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * @param message  the text that was (or is about to be) delivered
 * @param io.capture   () => Promise<string>|string — pane capture WITH escapes (-e)
 * @param io.deliver   () => Promise<void>          — type/paste the text and submit
 * @param io.clear     (count) => Promise<void>     — remove `count` characters
 * @returns {{submitted: boolean, attempts: number, inferred?: boolean}}
 *   `inferred` is set when no echo was seen but the input box ended up empty (see below).
 */
export async function deliverAndVerify(message, io) {
  for (let attempt = 1; attempt <= MAX_SENDS; attempt++) {
    await io.deliver()

    let pane = ''
    for (let poll = 0; poll < VERIFY_POLLS; poll++) {
      await sleep(POLL_INTERVAL_MS)
      pane = stripDimPlaceholder(await io.capture())

      // Proof of submission is POSITION: above the input box, not merely present.
      if (paneSubmitted(pane, message) || paneSubmittedPrefix(pane, message)) {
        return { submitted: true, attempts: attempt }
      }

      if (paneStaged(pane, message)) {
        // In the box, unsubmitted. Retyping without clearing APPENDS, so clear
        // first — with backspaces, because C-u does nothing to this input.
        if (attempt < MAX_SENDS) {
          // Only our own text: a person may have typed in the box before it (B015).
          const { repeat } = clearInputPlan(pane, message)
          if (repeat === 0) return { submitted: false, attempts: attempt }
          await io.clear(repeat)
        }
        break
      }
    }

    // Neither echoed nor staged for the whole window. An EMPTY input box means the text left
    // it: the Enter went through and the echo was collapsed or scrolled away. Retrying would
    // deliver the message twice (#663). Retry only on positive evidence that it is still staged.
    if (paneInputEmpty(pane)) return { submitted: true, attempts: attempt, inferred: true }
  }
  return { submitted: false, attempts: MAX_SENDS }
}
