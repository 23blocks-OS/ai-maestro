/**
 * Shared utilities for ChatView and MobileChatView
 * - Tool burst grouping (collapsing consecutive tool-only messages)
 * - Tool preview text generation
 * - Path shortening
 */

// ── Types ─────────────────────────────────────────────────────────

interface ContentBlock {
  type: string
  text?: string
  name?: string
  input?: any
  id?: string
  [key: string]: any
}

interface Message {
  type: string
  timestamp?: string
  uuid?: string
  message?: {
    content?: string | ContentBlock[]
    model?: string
  }
  thinking?: string
  summary?: string
  toolName?: string
  toolInput?: any
  operation?: 'enqueue' | 'dequeue'
  content?: string
}

export interface ToolBurst {
  _isBurst: true
  messages: Message[]
  tools: { name: string; count: number }[]
  totalCount: number
  startTimestamp?: string
  endTimestamp?: string
}

export type GroupedItem = Message | ToolBurst

// ── Helpers ───────────────────────────────────────────────────────

/** Shorten a file path to last 3 segments */
export function shortenPath(p: string): string {
  const parts = p.split('/')
  if (parts.length <= 3) return p
  return '.../' + parts.slice(-3).join('/')
}

/** Get tools from a message's content blocks */
function getToolsFromContent(message: Message): ContentBlock[] {
  const content = message.message?.content
  if (!Array.isArray(content)) return []
  return content.filter(block => block.type === 'tool_use')
}

/** Get text content from a message */
function getTextContent(message: Message): string {
  const content = message.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter(block => block.type === 'text' && block.text)
      .map(block => block.text)
      .join('\n\n')
  }
  return ''
}

/** Returns true if the message is an assistant message with tools but no text content */
export function isToolOnlyMessage(msg: Message): boolean {
  if (msg.type !== 'assistant') return false
  const tools = getToolsFromContent(msg)
  if (tools.length === 0) return false
  const text = getTextContent(msg)
  return !text
}

// ── Tool Preview (Desktop — from ContentBlock) ────────────────────

/** Get a one-line contextual preview for a tool (desktop ChatView) */
export function getToolPreview(tool: ContentBlock): string {
  const input = tool.input
  if (!input) return ''
  const name = tool.name || ''

  switch (name) {
    case 'Bash':
      return (input.command || '').slice(0, 80) + ((input.command?.length || 0) > 80 ? '...' : '')
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      return input.file_path ? shortenPath(input.file_path) : ''
    case 'Glob':
      return input.pattern || ''
    case 'Grep':
      return `/${input.pattern || ''}/${input.path ? ' ' + shortenPath(input.path) : ''}`
    case 'Task':
      return (input.description || '').slice(0, 80)
    case 'WebSearch':
      return input.query || ''
    case 'WebFetch':
      return input.url || ''
    default: {
      const keys = Object.keys(input)
      if (keys.length === 0) return ''
      const k = keys[0]
      const v = typeof input[k] === 'string' ? input[k] : JSON.stringify(input[k])
      const preview = `${k}: ${v}`
      return preview.slice(0, 80) + (preview.length > 80 ? '...' : '')
    }
  }
}

// ── Tool Preview (Mobile — from name + input) ─────────────────────

/** Get a tool-specific preview string (mobile MobileChatView) */
export function getToolPreviewText(name: string, input: any): string {
  if (!input) return ''
  switch (name) {
    case 'Bash':
      return (input.command || '').slice(0, 60) + ((input.command?.length || 0) > 60 ? '...' : '')
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit':
      return input.file_path ? shortenPath(input.file_path) : ''
    case 'Glob':
      return input.pattern || ''
    case 'Grep':
      return `/${input.pattern || ''}/${input.path ? ' ' + shortenPath(input.path) : ''}`
    case 'Task':
      return (input.description || '').slice(0, 60)
    case 'WebSearch':
      return input.query || ''
    case 'WebFetch':
      return input.url || ''
    default: {
      const keys = Object.keys(input)
      if (keys.length === 0) return ''
      const k = keys[0]
      const v = typeof input[k] === 'string' ? input[k] : JSON.stringify(input[k])
      const preview = `${k}: ${v}`
      return preview.slice(0, 60) + (preview.length > 60 ? '...' : '')
    }
  }
}

// ── Message Grouping ──────────────────────────────────────────────

/**
 * Group consecutive tool-only assistant messages into ToolBurst objects.
 *
 * Rules:
 * - Only tool-only assistant messages are candidates (has tools, no text)
 * - Streaks of 3+ consecutive tool-only messages become a ToolBurst
 * - Streaks of 1-2 pass through unchanged (not worth grouping)
 * - In 'assisted' mode, tool-only messages are filtered out entirely
 * - Non-assistant messages pass through unchanged
 */
export function groupMessages(messages: Message[], chatMode: 'power' | 'assisted'): GroupedItem[] {
  if (chatMode === 'assisted') {
    // Assisted mode: filter out tool-only messages entirely (existing behavior)
    return messages.filter(msg => !isToolOnlyMessage(msg))
  }

  const result: GroupedItem[] = []
  let streak: Message[] = []

  const flushStreak = () => {
    if (streak.length === 0) return

    if (streak.length >= 3) {
      // Build tool summary
      const toolCounts = new Map<string, number>()
      for (const msg of streak) {
        const tools = getToolsFromContent(msg)
        for (const tool of tools) {
          const name = tool.name || 'Unknown'
          toolCounts.set(name, (toolCounts.get(name) || 0) + 1)
        }
      }

      const tools = Array.from(toolCounts.entries())
        .sort((a, b) => b[1] - a[1]) // Most frequent first
        .map(([name, count]) => ({ name, count }))

      const totalCount = tools.reduce((sum, t) => sum + t.count, 0)

      const burst: ToolBurst = {
        _isBurst: true,
        messages: [...streak],
        tools,
        totalCount,
        startTimestamp: streak[0].timestamp,
        endTimestamp: streak[streak.length - 1].timestamp,
      }
      result.push(burst)
    } else {
      // 1-2 tool-only messages: pass through individually
      for (const msg of streak) {
        result.push(msg)
      }
    }
    streak = []
  }

  for (const msg of messages) {
    if (isToolOnlyMessage(msg)) {
      streak.push(msg)
    } else {
      flushStreak()
      result.push(msg)
    }
  }

  // Flush any remaining streak
  flushStreak()

  return result
}
