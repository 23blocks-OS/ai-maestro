/**
 * Which records of a Claude Code transcript are conversation messages.
 *
 * A transcript line has a `type`. Besides `user` and `assistant` there are many others
 * (`attachment`, `system`, `last-prompt`, `permission-mode`, `file-history-snapshot`, ...), and Claude
 * Code adds more with new versions. Since 2.1.300 it also writes `api-request-blob`: the system
 * prompt, tool list and message history of each API request, in the same `message.content` shape as a
 * chat line. A reader that takes "any line with message.content" indexes those as if a person or the
 * agent had said them.
 *
 * So this is an allow-list: only these types are conversation. A record type nobody has heard of yet
 * is ignored, never indexed. Line numbers are not affected: readers still count every nonblank line,
 * so a saved offset (`last_indexed_message_count`) means the same line before and after.
 */

export const CONVERSATION_RECORD_TYPES = ['user', 'assistant']

/**
 * The text the person sent, without the tags Claude Code (2.1.31x) puts around a paste:
 * `\n\n<pasted_content id="751d">\n` … `\n</pasted_content id="751d">\n\n`. The closing tag can land
 * mid-word ("stu" + tag + "ff"), so the exact inserted pieces are removed first; any other form of the
 * tags goes after that. Text without the tags is returned unchanged (same string).
 */
export function unwrapPastedContent(text) {
  if (typeof text !== 'string' || !text.includes('pasted_content')) return text
  return text
    .replace(/\n\n<pasted_content id="[^"]*">\n/g, '')
    .replace(/\n<\/pasted_content id="[^"]*">\n\n/g, '')
    .replace(/<\/?pasted_content(?: id="[^"]*")?>/g, '')
    .trim()
}

/**
 * Is this "user" text really the system's (B024)? The chat drew these as the person's own messages:
 * - Claude Code's `isMeta` lines: a loaded skill, our Stop hook's unread-mail notice, image metadata,
 *   sub-agent hand-backs, classifier and usage-limit notices (checked on 150 real transcripts: none is
 *   text a person typed);
 * - Claude Code's own queued texts: `<task-notification>` (a background task finished), and messages
 *   from sub-agents or other sessions (`<agent-message …>`, `<cross-session-message …>`);
 * - AI Maestro's message notice typed into the pane, `[#ref] [MESSAGE] …` (older form `[MESSAGE] …`),
 *   an ordinary prompt in the transcript, so only its shape tells.
 * - the inbox poll's line (lib/agent.ts), also an ordinary prompt: only when the whole text is that
 *   notice, so words a person typed after it stay theirs (they can land in the same prompt);
 * - Claude Code's interrupted marker, slash commands and their output;
 * - `[CANVAS]`, a click on a canvas page: it says what the person did, but the system wrote it.
 * - `[REACTION]`, a person's reaction (lib/chat-reactions.ts): only the whole line in its exact shape, so
 *   a person who types the word, or words after the line in the same prompt, stays the person.
 * Returns the kind, or null for the person's own text.
 */
/**
 * A person's words at a device (F098), as AI Maestro types the message notice into the pane (lib/device-events.ts):
 * `[#ref] [MESSAGE] Someone at your device NAME — from … <external-content …> [… instructions.] WORDS (Said at your device "NAME" …`
 */
const DEVICE_NOTICE = /^(?:\p{Extended_Pictographic}\s*)?(?:\[[A-Z]+\]\s+)?(?:\[#([0-9a-z]+)\]\s+)?\[MESSAGE\]\s+Someone at your device (.+?) — from /u
const DEVICE_SUFFIX = /\s*\((Said|Typed) at your device "/

/** The words and how they came (said or typed), from a device notice or from the stored message. `cut` when the notice ended them. */
export function deviceWords(body) {
  const marker = body.indexOf('instructions.]')
  const rest = marker >= 0 ? body.slice(marker + 'instructions.]'.length) : body
  const end = rest.search(DEVICE_SUFFIX)
  if (end < 0) return { text: rest.trim().replace(/…$/, ''), source: null, cut: true }
  return { text: rest.slice(0, end).trim(), source: rest.slice(end).match(DEVICE_SUFFIX)[1].toLowerCase(), cut: false }
}

/** A device notice parsed, or null for any other text */
export function parseDeviceNotice(text) {
  const m = typeof text === 'string' ? text.trimStart().match(DEVICE_NOTICE) : null
  return m ? { ref: m[1] || null, device: m[2], ...deviceWords(text) } : null
}

const INBOX_POLL_NOTICE = /^(?:(?:\[(?:\d+ )?URGENT\]\s*)?You have (?:a new message|\d+ new messages)\b[^\n]*?\. Please check your inbox\.\s*)+$/

const REACTION_NOTE = /^\[REACTION\] [^\n]* reacted \S+ \([^)\n]*\) to your message: "[^"\n]*"\s*$/

export function systemNoticeKind(text, isMeta = false) {
  const t = typeof text === 'string' ? text.trimStart() : ''
  if (/^Base directory for this skill:/.test(t)) return 'skill'
  if (/^Stop hook feedback:/.test(t)) return 'stop-hook'
  if (DEVICE_NOTICE.test(t)) return 'device'
  if (/^(?:\p{Extended_Pictographic}\s*)?(?:\[[A-Z]+\]\s+)?(?:\[#[0-9a-z]+\]\s+)?\[MESSAGE\]\s/u.test(t)) return 'message-notice'
  if (INBOX_POLL_NOTICE.test(t)) return 'message-notice'
  if (/^\[CANVAS\]\s/.test(t)) return 'canvas'
  if (REACTION_NOTE.test(t)) return 'reaction'
  if (/^\[Request interrupted by user\b[^\n]*\]$/.test(t)) return 'interrupted'
  if (/^<(?:command-name|command-message|local-command-stdout|local-command-stderr)>/.test(t)) return 'command'
  if (/^<task-notification>/.test(t)) return 'task-notification'
  if (/^<(?:agent-message|cross-session-message)\b/.test(t)) return 'agent-message'
  return isMeta ? 'meta' : null
}

/** True for a parsed transcript line that is something the person or the agent said */
export function isConversationRecord(record) {
  if (!record || typeof record !== 'object') return false
  const type = record.type
  return typeof type === 'string' && CONVERSATION_RECORD_TYPES.includes(type)
}
