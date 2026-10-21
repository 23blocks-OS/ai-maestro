/**
 * Does an observed permission request still deserve "Needs you"?
 *
 * Claude Code's PermissionRequest hook tells us a decision is pending the moment it is asked,
 * but fires nothing when the user answers, presses Esc or chooses "No" (measured on 2.1.306:
 * no Stop, no PostToolUse, no PermissionDenied). Without a check, a dismissed dialog would keep
 * the agent on "Needs you" until its next event. So the server looks at the terminal: once the
 * pane no longer shows a decision, the request is over.
 *
 * Pure (no tmux, no IO): the caller captures the pane, so this can be tested with pane text.
 * It reuses the menu parser the chat card is built from, so "is a menu on screen" has one answer.
 */

import { parsePermissionMenu } from './pane-permission.mjs'

/** The dialog is drawn a fraction of a second after the hook fires: give it time before looking. */
export const OBSERVED_GRACE_MS = 2000

const lastLines = (text, n) => text.split('\n').map((l) => l.trim()).filter(Boolean).slice(-n)

/**
 * Is a decision on screen? True for a parsed permission menu, and also for the footer every
 * Claude Code dialog carries ("Esc to cancel" / "Enter to confirm"), so a dialog the menu parser
 * cannot read (an unusual layout) is never taken for a finished one.
 */
export function paneShowsDecision(paneText) {
  if (!paneText) return false
  if (parsePermissionMenu(paneText)) return true
  return lastLines(paneText, 12).join('\n').toLowerCase().match(/esc to cancel|enter to confirm|esc to exit/) !== null
}

/**
 * 'keep'   the request still stands (too young, pane unreadable, or a decision is on screen)
 * 'active' the dialog is gone and the agent is working (it was answered; the tool runs)
 * 'idle'   the dialog is gone and the agent waits at its prompt (Esc, "No", an interrupted turn)
 */
export function observedPermissionVerdict({ ageMs, paneText }) {
  if (!(ageMs >= OBSERVED_GRACE_MS)) return 'keep'
  // Nothing to look at is not proof that it is over.
  if (!paneText || !paneText.trim()) return 'keep'
  if (paneShowsDecision(paneText)) return 'keep'
  return lastLines(paneText, 15).join('\n').toLowerCase().includes('esc to interrupt') ? 'active' : 'idle'
}
