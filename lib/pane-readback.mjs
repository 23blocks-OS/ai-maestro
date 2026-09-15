/**
 * Reading a TUI pane: did our text get SUBMITTED, or is it just sitting there?
 *
 * ONE implementation, imported by both the TypeScript services and server.mjs.
 *
 * It lived in lib/notification-service.ts and was therefore unavailable to
 * server.mjs — which is the file the chat UI actually calls. So the chat sent
 * text and reported success without ever checking, for months, while a complete
 * verification routine sat one directory away. Duplicated logic that drifts is
 * the single most expensive pattern in this codebase; this module exists so
 * there is nothing to duplicate.
 */

/**
 * A line that is the agent's input prompt, after stripping the box-drawing
 * chrome TUIs wrap it in (`│ > `, `╭─`, and friends).
 *
 * Matches Claude Code and Codex (`>`), fish/starship prompts (`❯`), and a bare
 * shell (`$`, `%`). Deliberately loose: a false positive costs one unnecessary
 * resend, a false negative costs a lost message.
 */
export const INPUT_PROMPT_LINE = /^[\s│┃|╎┆:]*[>❯$%⏵]\s?/

/**
 * Claude Code renders your PREVIOUS prompt dim inside an EMPTY input box as a
 * hint. In a plain `capture-pane -p` it is indistinguishable from text you
 * typed — it cost two wrong diagnoses during one live debugging session on
 * 15 Sep 2026. Only `capture-pane -e` separates them, via SGR dim.
 */
const SGR_DIM_RUN = /\x1b\[2m[\s\S]*?(?:\x1b\[(?:0|22)m|$)/g
const SGR_ANY = /\x1b\[[0-9;]*m/g

export function stripDimPlaceholder(paneWithEscapes) {
  return String(paneWithEscapes || '').replace(SGR_DIM_RUN, '').replace(SGR_ANY, '')
}

/**
 * Split a pane into what the agent has ACCEPTED and what is still in its input
 * box. The input box is the tail of the pane from its last prompt line onward.
 */
export function splitPaneAtInput(pane) {
  const lines = String(pane || '').split('\n')
  let promptAt = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (INPUT_PROMPT_LINE.test(lines[i])) { promptAt = i; break }
  }
  if (promptAt === -1) return { accepted: pane, input: '' }
  return {
    accepted: lines.slice(0, promptAt).join('\n'),
    input: lines.slice(promptAt).join('\n'),
  }
}

/** Whitespace-insensitive: a TUI wraps long text mid-token across lines. */
function paneContains(pane, needle) {
  const strip = (s) => String(s || '').replace(/\s+/g, '')
  const n = strip(needle)
  return n.length > 0 && strip(pane).includes(n)
}

/**
 * Proof of SUBMISSION, not merely of presence. The needle must appear ABOVE the
 * input box: a TUI echoes a submitted prompt into the transcript above its
 * input, so "above" is what submission looks like and "in the box" is what a
 * lost Enter looks like.
 */
export function paneSubmitted(pane, needle) {
  return paneContains(splitPaneAtInput(pane).accepted, needle)
}

/** Our text is in the input box, unsubmitted — positive evidence of failure. */
export function paneStaged(pane, needle) {
  return paneContains(splitPaneAtInput(pane).input, needle)
}

/**
 * How to clear a TUI input box.
 *
 * NOT `C-u`. That was the clear key here for months and is a no-op in Claude
 * Code's input — verified by hand on a live agent: a staged line survived two
 * `C-u` and an `Escape`, and only backspace removed characters. A clear that
 * does not clear makes a retry WORSE than no retry, because the retype appends
 * to whatever is already staged.
 */
export function clearInputKeys(stagedLength) {
  return { key: 'BSpace', repeat: Math.min(2000, Math.max(16, (stagedLength || 0) + 16)) }
}
