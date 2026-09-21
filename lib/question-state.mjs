/**
 * Is this agent question still live, and has it been answered?
 *
 * ONE implementation, used by both chat renderers.
 *
 * `ChatView` and `MobileChatView` are deliberately different LAYOUTS — merging
 * them would produce one component full of branching markup, which is worse than
 * two. What was actually duplicated is this logic, and on 15 Sep 2026 it cost a
 * release: v0.38.13 fixed the rules in ChatView, v0.38.14 had to fix the same
 * rules again in MobileChatView, and in between the bug was live for anyone whose
 * `layoutOverride` put them on the mobile renderer — including on a desktop
 * browser.
 */

/** The AskUserQuestion tool_use block in a message, if there is one. */
export function askUserQuestionIn(message) {
  const content = message?.message?.content
  if (!Array.isArray(content)) return null
  for (const block of content) {
    if (block?.type === 'tool_use' && block.name === 'AskUserQuestion') return block
  }
  return null
}

/**
 * Answered?
 *
 * `tool_result_marker` is emitted by parseJsonlLines for every completed tool
 * call, so this survives a page reload. The local `answered` set is a session
 * nicety, not the record — it used to be the ONLY working source, which is why
 * reloading resurrected questions answered a hundred messages earlier.
 */
export function isQuestionAnswered(messages, toolUseId, locallyAnswered) {
  if (!toolUseId) return false
  if (locallyAnswered && locallyAnswered.has(toolUseId)) return true
  return (messages || []).some((m) =>
    (m?.type === 'tool_result_marker' && m.tool_use_id === toolUseId) ||
    (m?.type === 'user' &&
      Array.isArray(m?.message?.content) &&
      m.message.content.some(
        (b) => b?.type === 'tool_result' && b.tool_use_id === toolUseId
      ))
  )
}

/**
 * Still live?
 *
 * Must be the LAST question, and nothing may have been said since it was asked.
 * Once the agent has spoken the question is settled — clicking an option then
 * sends a keystroke to a menu that is no longer on screen, which is how a stale
 * card appears to "block" the chat.
 *
 * Hook status alone is not sufficient: a pane reporting `waiting_for_input` with
 * `notificationType: idle_prompt` is sitting at an EMPTY prompt, indistinguishable
 * from waiting on a menu by that signal.
 */
export function isQuestionCurrent(messages, toolUseId, hookState) {
  if (!toolUseId) return false
  const list = messages || []
  let askIdx = -1
  let lastAskId = null
  list.forEach((m, i) => {
    const t = askUserQuestionIn(m)
    if (t?.id) { lastAskId = t.id; if (t.id === toolUseId) askIdx = i }
  })
  if (lastAskId !== toolUseId || askIdx === -1) return false

  const spokeSince = list.slice(askIdx + 1).some(
    (m) => m?.type === 'assistant' || m?.type === 'user' || m?.type === 'thinking'
  )
  if (spokeSince) return false

  const s = hookState?.status
  return s === 'waiting_for_input' || s === 'permission_request'
}

/**
 * Should the card render as history (a single line) rather than a live menu?
 *
 * Greying the buttons out is not enough — the full panel still draws on every
 * reload and every switch back from the terminal, which is what people actually
 * complain about.
 */
export function isQuestionSettled(messages, toolUseId, hookState, locallyAnswered) {
  return (
    isQuestionAnswered(messages, toolUseId, locallyAnswered) ||
    !isQuestionCurrent(messages, toolUseId, hookState)
  )
}

/** Whitespace-insensitive, terminal-reflow tolerant. */
const _norm = (t) => String(t || '').replace(/\s+/g, ' ').trim()
const _stripTrailingEllipsis = (t) => _norm(t).replace(/[…]+$|\.{2,}$/g, '').trim()

/** Option labels of an AskUserQuestion tool_use block (across all its questions). */
function askOptionLabels(askBlock) {
  const qs = askBlock?.input?.questions
  if (!Array.isArray(qs)) return []
  const out = []
  for (const q of qs) {
    for (const o of q?.options || []) {
      if (o?.label) out.push(String(o.label))
    }
  }
  return out
}

/** One pane label vs one ask label: equal, or one a (truncation) prefix of the other. */
function labelsMatch(paneLabel, askLabel) {
  const p = _stripTrailingEllipsis(paneLabel)
  const a = _norm(askLabel)
  if (!p || !a) return false
  return a === p || a.startsWith(p) || p.startsWith(a)
}

/**
 * Does this pane/hook permission card actually BELONG to a transcript
 * AskUserQuestion — the same question the transcript already owns by identity?
 *
 * A tmux menu carries no id, so `detectPermissionFromPane` produces a clickable
 * card resolved purely by what is ON SCREEN — the one place in the chat that
 * still resolves a target by position rather than identity. When that card is
 * really an AskUserQuestion being displayed, the transcript already holds the
 * SAME question WITH a tool_use id, and the identity guards (isQuestionAnswered
 * / isQuestionCurrent) already govern it. Drawing the id-less pane card *as
 * well* is how an answered question reappears: the transcript card is correctly
 * hidden, and the pane card, having no id to check, draws anyway. Reported
 * repeatedly as "the question I answered hours ago is back".
 *
 * So: if the pane card's options content-match the transcript's LAST
 * AskUserQuestion, it belongs to that question — the caller should defer to the
 * transcript card and NOT draw the pane card. If it matches nothing (a genuine
 * tool-permission prompt like "Allow Edit?", which has no AskUserQuestion in the
 * transcript), the pane/hook card is the only representation and must render.
 *
 * Matched by option LABELS — the labels have been through a terminal, so the
 * comparison is whitespace-insensitive and tolerant of the 200-char truncation
 * parsePermissionMenu applies. Only the LAST question is considered: an older
 * question cannot be the live menu, and matching against all of them would let a
 * generic Yes/No permission prompt collide with some old question that happened
 * to offer Yes/No.
 */
export function paneCardBelongsToTranscriptQuestion(messages, hookState) {
  const paneOpts = (hookState?.options || []).map((o) => _norm(o?.label)).filter(Boolean)
  if (paneOpts.length === 0) return false

  let lastAsk = null
  for (const m of messages || []) {
    const t = askUserQuestionIn(m)
    if (t) lastAsk = t
  }
  const askOpts = askOptionLabels(lastAsk)
  if (askOpts.length === 0) return false

  // Every pane option must correspond to some ask option. The ask labels are the
  // source of truth; the pane may have truncated a long one.
  return paneOpts.every((p) => askOpts.some((a) => labelsMatch(p, a)))
}
