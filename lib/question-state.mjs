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
