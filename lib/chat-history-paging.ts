/**
 * Paging the chat history backwards. The server sends the newest page with `historyStart` (where
 * that page begins in the conversation); scrolling up asks for the page that ends there. Both chat
 * views (ChatView, MobileChatView) keep the list through these two functions.
 */

export interface HistoryCursor {
  /** The conversation file the cursor belongs to; another file means a new conversation */
  file: string | null
  /** Index of the oldest loaded message in the whole conversation; 0 = nothing older */
  start: number
}

interface HistoryPush<T> {
  messages?: T[]
  conversationFile?: string | null
  historyStart?: number
  hasMore?: boolean
}

interface HistoryPage<T> {
  messages?: T[]
  conversationFile?: string | null
  start?: number
  before?: number
  hasMore?: boolean
  failed?: boolean
}

function dedupe<T>(list: T[], key: (m: T) => string): T[] {
  const seen = new Set<string>()
  return list.filter(m => {
    const k = key(m)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * A full history push (connect, refresh, reconnect). Keeps the older pages already loaded when it
 * is the same conversation, so a refresh does not throw away what the person scrolled back to.
 */
export function mergeHistory<T>(prev: T[], cursor: HistoryCursor | null, history: HistoryPush<T>, key: (m: T) => string) {
  const messages = history.messages || []
  // A server without paging sends no historyStart: show what it sent, offer nothing older
  if (typeof history.historyStart !== 'number') return { messages, cursor: null, hasMore: false }
  const file = history.conversationFile ?? null
  if (cursor && cursor.file === file && cursor.start < history.historyStart && prev.length > 0) {
    const older = prev.slice(0, Math.min(prev.length, history.historyStart - cursor.start))
    return { messages: dedupe([...older, ...messages], key), cursor, hasMore: cursor.start > 0 }
  }
  return { messages, cursor: { file, start: history.historyStart }, hasMore: !!history.hasMore }
}

/** An older page arrived. Ignored when it answers a cursor we no longer have. */
export function prependPage<T>(prev: T[], cursor: HistoryCursor | null, page: HistoryPage<T>, key: (m: T) => string) {
  if (!cursor) return { messages: prev, cursor, hasMore: false, failed: false }
  if (page.failed) return { messages: prev, cursor, hasMore: cursor.start > 0, failed: true }
  if (page.conversationFile !== cursor.file) return { messages: prev, cursor, hasMore: false, failed: false }
  if (page.before !== cursor.start || typeof page.start !== 'number') return { messages: prev, cursor, hasMore: cursor.start > 0, failed: false }
  return {
    messages: dedupe([...(page.messages || []), ...prev], key),
    cursor: { file: cursor.file, start: page.start },
    hasMore: !!page.hasMore,
    failed: false,
  }
}
