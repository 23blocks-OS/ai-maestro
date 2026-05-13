/**
 * Meeting Inject Queue
 *
 * In-memory per-session FIFO queue for meeting message injection.
 * Agents that support additionalContext (Claude, Gemini) get messages
 * queued here and drained by the hook on the next idle_prompt.
 * Other agents use the legacy tmux send-keys path with bracketed paste.
 *
 * Queue is ephemeral (lost on restart) — durable storage is the
 * meeting chat log and AMP inbox.
 *
 * Cherry-picked from swickson/ai-maestro PRs #25 and #50.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface QueuedMeetingMessage {
  text: string
  enqueuedAt: string // ISO
}

export type AgentKind = 'claude' | 'codex' | 'gemini' | 'unknown'

// ── Queue ───────────────────────────────────────────────────────────────────

const queue = new Map<string, QueuedMeetingMessage[]>()

/** Append a message to the session's FIFO queue. */
export function enqueueForSession(sessionName: string, text: string): void {
  if (!text) return
  const list = queue.get(sessionName) ?? []
  list.push({ text, enqueuedAt: new Date().toISOString() })
  queue.set(sessionName, list)
}

/** Destructive read — returns all queued messages and removes them. */
export function drainForSession(sessionName: string): QueuedMeetingMessage[] {
  const list = queue.get(sessionName)
  if (!list || list.length === 0) return []
  queue.delete(sessionName)
  return list
}

/** Non-destructive read — returns a copy without removing. */
export function peekForSession(sessionName: string): QueuedMeetingMessage[] {
  const list = queue.get(sessionName)
  if (!list) return []
  return [...list]
}

/** Wipe the entire queue (e.g. on meeting end). */
export function clearAll(): void {
  queue.clear()
}

// ── Agent Kind Detection ────────────────────────────────────────────────────

/** Infer agent kind from the running program name. */
export function inferKindFromProgram(program: string | undefined | null): AgentKind {
  if (!program) return 'unknown'
  const p = program.toLowerCase()
  if (p.includes('claude')) return 'claude'
  if (p.includes('codex')) return 'codex'
  if (p.includes('gemini')) return 'gemini'
  return 'unknown'
}

/**
 * Check if an agent kind should use the additionalContext injection path.
 * Gated by MAESTRO_MEETING_CONTEXT_KINDS env var.
 *
 * Values: comma-separated kinds ("claude", "claude,gemini"), or "all".
 * Unset/empty = everyone stays on legacy send-keys path.
 * 'unknown' kinds always get legacy path.
 */
export function shouldUseAdditionalContext(program: string | undefined | null): boolean {
  const flag = process.env.MAESTRO_MEETING_CONTEXT_KINDS
  if (!flag) return false

  const kind = inferKindFromProgram(program)
  if (kind === 'unknown') return false

  const allowed = flag.toLowerCase().trim()
  if (allowed === 'all') return true

  return allowed.split(',').map(k => k.trim()).includes(kind)
}

// ── Legacy Path Sanitizers ──────────────────────────────────────────────────

/**
 * Prefix a space before `!` at line-start to prevent shell history expansion
 * when text is injected via tmux send-keys.
 */
export function sanitizeForRawInject(text: string): string {
  return text.replace(/^!/gm, ' !')
}

/**
 * Wrap text in DEC 2004 bracketed-paste markers.
 * This tells the receiving TUI (Codex, Gemini) to treat the entire block
 * as pasted text rather than typed input, preventing race conditions
 * where Enter arrives before the paste window closes.
 */
export function wrapAsBracketedPaste(text: string): string {
  return `\x1b[200~${text}\x1b[201~`
}
