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
  return n.length > 0 && (strip(pane).includes(n) || strip(stripLineChrome(pane)).includes(n))
}

/**
 * Copilot CLI draws a right-hand border on every transcript line and a right-aligned
 * time (`11:40`) on the first line of a prompt echo. Once whitespace is removed those
 * sit between the lines of a multi-line or wrapped message, so it is never contiguous
 * and a submitted prompt looked unsent (the retry then delivered it twice). Compared
 * second, so tools that draw no such chrome behave exactly as before.
 */
function stripLineChrome(pane) {
  return String(pane || '')
    .split('\n')
    .map((line) => line
      .replace(/\s*[┃│]\s*$/, '')
      .replace(/\s{2,}\d{1,2}:\d{2}(?:\s?[AaPp][Mm])?\s*$/, ''))
    .join('\n')
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

/**
 * Looser proof for a message the TUI does not echo whole: the first line (at least 12
 * characters of it) appears above the input box. Claude Code collapses a large or
 * multi-line paste to `[Pasted text #1 +N lines]` and a long echo can scroll out of
 * the visible pane, so the whole message never matches although it was submitted
 * (#663: the retry then delivered it twice).
 */
export function paneSubmittedPrefix(pane, needle) {
  const first = String(needle || '').split('\n').map((l) => l.trim()).find(Boolean) || ''
  if (first.replace(/\s+/g, '').length < 12) return false
  return paneContains(splitPaneAtInput(pane).accepted, first)
}

/**
 * The input box is there and holds nothing. After a delivery that is neither echoed nor
 * staged, an empty box means the Enter went through. A dialog holding the keyboard does
 * not look like this: its selected option (`❯ 1. Yes`) is a non-empty prompt line, and a
 * pane with no prompt line at all is not empty, it is unknown.
 */
export function paneInputEmpty(pane) {
  const lines = String(pane || '').split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!INPUT_PROMPT_LINE.test(lines[i])) continue
    const content = lines[i].replace(INPUT_PROMPT_LINE, '').replace(/[\s│┃|╎┆╭╮╰╯─]/g, '')
    return content === ''
  }
  return false
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

/**
 * How to clear OUR text out of the input box without touching a person's.
 *
 * `clearInputKeys` presses backspace length + 16 times. That is right when the box held
 * only our text (the extra presses land on nothing). When someone had already typed in
 * the box, our text sits at the END of theirs, and the same count also eats up to 16 of
 * their characters (B015). So look at the box: if anything besides our message is in it,
 * delete exactly our message, counted in characters as the TUI counts them (code points,
 * not UTF-16 units).
 *
 * A multi-line message may have been folded by the TUI into one `[Pasted text #1 +N lines]`
 * token, so its length says nothing about how many presses remove it. When a person's text
 * is also in the box, `repeat` is 0: do not clear, do not guess.
 *
 * @param pane    capture of the pane where `message` was seen staged
 * @param message the text we typed
 * @returns {{key: string, repeat: number, preexisting: boolean}}
 */
export function clearInputPlan(pane, message) {
  const strip = (v) => String(v || '').replace(/\s+/g, '')
  const input = splitPaneAtInput(pane).input
  const content = stripLineChrome(input)
    .split('\n')
    .map((line, i) => (i === 0 ? line.replace(INPUT_PROMPT_LINE, '') : line))
    .join('\n')
    .replace(/[│┃|╎┆╭╮╰╯─]/g, '')
  const all = strip(content)
  const ours = strip(message)
  const at = ours ? all.indexOf(ours) : -1
  const preexisting = at !== -1 && (all.slice(0, at) + all.slice(at + ours.length)).length > 0
  if (!preexisting) {
    return { ...clearInputKeys(message ? [...message].length : 0), preexisting: false }
  }
  const multiline = /[\r\n]/.test(String(message))
  return { key: 'BSpace', repeat: multiline ? 0 : [...String(message)].length, preexisting: true }
}
