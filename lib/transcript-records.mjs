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

/** True for a parsed transcript line that is something the person or the agent said */
export function isConversationRecord(record) {
  if (!record || typeof record !== 'object') return false
  const type = record.type
  return typeof type === 'string' && CONVERSATION_RECORD_TYPES.includes(type)
}
