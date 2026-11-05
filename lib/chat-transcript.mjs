/**
 * Chat transcript helpers — single source of truth for locating and parsing
 * Claude Code conversation JSONL files and the chat-state (hook) file.
 *
 * Used by BOTH server.mjs (plain Node ESM) and the TypeScript services
 * (services/agents-chat-service.ts). Keep this file dependency-free plain JS.
 *
 * History: this logic used to be duplicated in three places, and the
 * underscore path-encoding bug (v0.35.31, commit 67fca8d) had to be fixed in
 * all of them. Do not fork this logic again.
 */

import { isConversationRecord, unwrapPastedContent, systemNoticeKind } from './transcript-records.mjs'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import {
  isCodexLine,
  codexLineToMessages,
  resolveCodexTranscriptForDir,
} from './transcript-codex.mjs'
import {
  isGrokLine,
  grokLineToMessages,
  pushGrokMessage,
  stripGrokMarkers,
  resolveGrokTranscriptForDir,
} from './transcript-grok.mjs'
import {
  isPiLine,
  piLineToMessages,
  resolvePiTranscriptForDir,
} from './transcript-pi.mjs'
import {
  isCopilotAgent,
  copilotHomeOf,
  isCopilotLine,
  copilotLineToMessages,
  resolveCopilotTranscriptForDir,
} from './transcript-copilot.mjs'

/**
 * Encode a working directory the way Claude Code names project dirs under
 * ~/.claude/projects. Claude Code replaces `/`, `_` AND `.` with `-`.
 * (The `.` case is the same bug class as the v0.35.31 underscore fix.)
 */
export function encodeProjectDirName(workingDir) {
  return workingDir.replace(/[/_.]/g, '-')
}

/** Extract the effective working directory from a registry agent. */
export function getAgentWorkingDir(agent) {
  return (
    agent?.workingDirectory ||
    agent?.sessions?.[0]?.workingDirectory ||
    agent?.preferences?.defaultWorkingDirectory ||
    null
  )
}

/**
 * Resolve the current conversation JSONL file for a working directory.
 * Returns { name, path, mtime } of the most recently modified .jsonl, or null.
 */
export function resolveJsonlPathForDir(workingDir) {
  if (!workingDir) return null

  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')
  const conversationDir = path.join(claudeProjectsDir, encodeProjectDirName(workingDir))

  if (!fs.existsSync(conversationDir)) return null

  let files
  try {
    files = fs.readdirSync(conversationDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        const p = path.join(conversationDir, f)
        try {
          return { name: f, path: p, mtime: fs.statSync(p).mtime }
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
  } catch {
    return null
  }

  return files.length > 0 ? files[0] : null
}

/** True when this agent runs codex rather than Claude Code. */
function isCodexAgent(agent) {
  const p = (agent?.program || '').toLowerCase()
  return p.includes('codex')
}

/** True when this agent runs Grok Build (xAI). */
function isGrokAgent(agent) {
  const p = (agent?.program || '').toLowerCase()
  return p.includes('grok')
}

/** True when this agent runs Pi (pi.dev). Whole-name match: "pi" sits inside far too many words. */
export function isPiAgent(agent) {
  const p = (agent?.program || '').trim().toLowerCase().replace(/\s+/g, '-')
  return p === 'pi' || p === 'pi-agent' || p === 'pi-coding-agent'
}

/**
 * Convenience wrapper taking a registry agent.
 *
 * Dispatches by program (F004): a codex agent's transcript lives under
 * ~/.codex/sessions, not ~/.claude/projects. Both return the same
 * { path, name, mtime } shape, so getChatHistory and the JSONL watcher are
 * unchanged.
 */
export function resolveJsonlPath(agent) {
  const dir = getAgentWorkingDir(agent)
  if (isCodexAgent(agent)) return resolveCodexTranscriptForDir(dir)
  if (isGrokAgent(agent)) return resolveGrokTranscriptForDir(dir)
  if (isPiAgent(agent)) return resolvePiTranscriptForDir(dir)
  if (isCopilotAgent(agent)) return resolveCopilotTranscriptForDir(dir, { home: copilotHomeOf(agent) })
  return resolveJsonlPathForDir(dir)
}

/**
 * Parse JSONL lines into chat message objects.
 *
 * - Skips tool-result user messages (invisible in chat)
 * - Converts compact_boundary system messages to `summary` messages
 * - Extracts assistant thinking blocks into separate `thinking` messages
 *
 * Synthesized messages get DERIVED uuids (`<parent>#thinking-0`, `<parent>#summary`)
 * so client-side uuid dedup never drops a thinking block against its parent
 * assistant message (they used to share the parent's uuid verbatim).
 */
export function parseJsonlLines(lines, limit = 100) {
  const messages = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const message = JSON.parse(line)

      // Multi-provider (F004): codex writes a different envelope
      // ({timestamp, ordinal, type, payload}) than Claude Code. Detect per LINE
      // — the live watcher passes only the delta, so we cannot rely on the
      // session_meta header — and map codex events to the same shapes below.
      if (isCodexLine(message)) {
        for (const m of codexLineToMessages(message)) messages.push(m)
        continue
      }

      // Grok Build (F028): ACP update stream. Text chunks of one message are
      // merged; hook_execution / turn_completed / metadata map to nothing.
      if (isGrokLine(message)) {
        for (const m of grokLineToMessages(message)) pushGrokMessage(messages, m)
        continue
      }

      // Pi (F036): session entries ({type:'message', id, message:{role}}).
      // Self-identifying per line, like codex and grok.
      if (isPiLine(message)) {
        for (const m of piLineToMessages(message)) messages.push(m)
        continue
      }

      // GitHub Copilot CLI (F038): events.jsonl, dotted event types
      // ({type:'user.message', data, id, timestamp, parentId}).
      if (isCopilotLine(message)) {
        for (const m of copilotLineToMessages(message)) messages.push(m)
        continue
      }

      // Claude Code also writes bookkeeping lines that carry a COPY of what it sent to the model
      // ('api-request-blob', and whatever it names the next one). They have message.role and
      // message.content, so the chat drew them as agent bubbles: the person's own text appeared
      // again under the agent's name, and the system reminders showed up as raw
      // "<total_tokens>...</total_tokens>" text. Only 'user' and 'assistant' lines are conversation.
      if (message.message && typeof message.message === 'object' && !isConversationRecord(message)) continue

      // Tool-result messages are dropped from the visible transcript — they are
      // raw tool output, not conversation. But the UI needs to know WHICH tool
      // calls have results, or it cannot tell an answered question from a live
      // one: isQuestionAnswered() searched these very messages for a matching
      // tool_result, and they had already been deleted here. The only other
      // record was a useState Set, so reloading the page made every
      // AskUserQuestion in the window render as live and unanswered again,
      // however long ago it had been answered. Reported 15 Sep 2026 against a
      // question the conversation had moved 124 lines past.
      //
      // Keep a marker instead of the payload: cheap, and it survives a reload
      // because it comes from the transcript on disk.
      if (message.type === 'user' && message.toolUseResult) {
        const content = message.message?.content
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === 'tool_result' && block.tool_use_id) {
              messages.push({
                type: 'tool_result_marker',
                tool_use_id: block.tool_use_id,
                timestamp: message.timestamp,
                uuid: message.uuid ? `${message.uuid}#result` : undefined,
              })
            }
          }
        }
        continue
      }

      if (message.type === 'system' &&
          (message.subtype === 'compact_boundary' || message.subtype === 'microcompact_boundary')) {
        messages.push({
          type: 'summary',
          summary: message.content || 'Conversation compacted',
          timestamp: message.timestamp,
          uuid: message.uuid ? `${message.uuid}#summary` : undefined,
        })
        continue
      }

      // A message sent while the agent is BUSY is queued by Claude Code. Claude Code 2.1.31x writes
      //
      //   { type: 'queue-operation', operation: 'enqueue', content }      when it is queued,
      //   then either 'dequeue' (no content; a normal user line follows: it became the next turn)
      //   or 'remove' with reason 'absorbed_mid_turn', followed by
      //   { type: 'attachment', attachment: { type: 'queued_command', prompt } }   (read mid-turn).
      //
      // Older versions write only the attachment. So the enqueue is "Queued", and the user line or the
      // attachment is the delivery (B027): the attachment becomes the person's message, delivered where
      // the agent read it, and the client hides the "Queued" entry once its text was delivered
      // (lib/chat-utils.ts). dequeue and remove carry nothing to show.
      if (message.type === 'attachment' && message.attachment?.type === 'queued_command') {
        const text = unwrapPastedContent(message.attachment.prompt || '')
        const kind = systemNoticeKind(text)
        messages.push(kind ? notice(kind, text, message) : {
          type: 'user',
          message: { role: 'user', content: text },
          timestamp: message.timestamp,
          uuid: message.uuid,
          queued: true,
        })
        continue
      }
      if (message.type === 'queue-operation') {
        if (message.operation !== 'enqueue') continue
        const text = unwrapPastedContent(typeof message.content === 'string' ? message.content : '')
        // A queued message notice shows once, as a system note, when it is delivered
        if (!text || systemNoticeKind(text)) continue
        messages.push({ type: 'queue-operation', operation: 'enqueue', content: text, timestamp: message.timestamp })
        continue
      }

      // A paste arrives wrapped in <pasted_content> tags (B026): show, and match the "Sending" bubble
      // against, the text the person sent. Text the system put in a user line is a system note (B024).
      if (message.type === 'user' && message.message) {
        const c = message.message.content
        if (typeof c === 'string') message.message.content = unwrapPastedContent(c)
        else if (Array.isArray(c)) for (const b of c) if (b?.type === 'text') b.text = unwrapPastedContent(b.text)
        const text = typeof message.message.content === 'string' ? message.message.content
          : (Array.isArray(message.message.content) ? message.message.content : [])
            .filter(b => b?.type === 'text' && b.text).map(b => b.text).join('\n\n')
        // The summary Claude Code writes after compacting is marked isCompactSummary (and visible in the
        // transcript only), not isMeta: the same system text, not the person's message
        const kind = message.isCompactSummary === true
          ? 'compact-summary'
          : systemNoticeKind(text, message.isMeta === true || message.isVisibleInTranscriptOnly === true)
        if (kind) {
          messages.push(notice(kind, text, message))
          continue
        }
      }

      if (message.type === 'assistant' && message.message?.content) {
        const content = message.message.content
        if (Array.isArray(content)) {
          let thinkingIdx = 0
          for (const block of content) {
            if (block.type === 'thinking' && block.thinking) {
              messages.push({
                type: 'thinking',
                thinking: block.thinking,
                timestamp: message.timestamp,
                uuid: message.uuid ? `${message.uuid}#thinking-${thinkingIdx}` : undefined,
              })
              thinkingIdx++
            }
          }
        }
      }
      messages.push(message)
    } catch { /* skip malformed */ }
  }
  return stripGrokMarkers(messages).slice(-limit)
}

/** Text the system put into the conversation (B024): the chat shows it only in X-Ray, as the system's. */
function notice(kind, text, line) {
  return {
    type: 'system_notice',
    kind,
    text,
    timestamp: line.timestamp,
    uuid: line.uuid ? `${line.uuid}#notice` : undefined,
  }
}

/** Hash a working directory the way the chat-state hook does. */
/** A message a person reads as conversation: user or assistant text, not a tool call, a tool result or thinking. */
export function isConversationMessage(m) {
  if (m?.type !== 'user' && m?.type !== 'assistant') return false
  const content = m.message?.content
  if (typeof content === 'string') return content.trim().length > 0
  return Array.isArray(content) && content.some(b => b?.type === 'text' && String(b.text || '').trim())
}

/** Conversation messages in one history page. Tool calls, results and thinking come along but do not count. */
export const HISTORY_PAGE_MESSAGES = 40
/** A page never holds more than this many entries, so a turn of thousands of tool calls still pages */
export const HISTORY_PAGE_MAX_ENTRIES = 1500

/**
 * The page of `all` that ends just before index `end`: it goes back until it holds `visible`
 * conversation messages or `maxEntries` entries. `start` is the cursor for the next, older page.
 */
export function pageOfMessages(all, { end = all.length, visible = HISTORY_PAGE_MESSAGES, maxEntries = HISTORY_PAGE_MAX_ENTRIES } = {}) {
  const stop = Math.max(0, Math.min(end, all.length))
  let start = stop
  let seen = 0
  while (start > 0 && seen < visible && stop - start < maxEntries) {
    start--
    if (isConversationMessage(all[start])) seen++
  }
  return { messages: all.slice(start, stop), start, hasMore: start > 0 }
}

export function hashCwd(workingDir) {
  return crypto.createHash('md5').update(workingDir || '').digest('hex').substring(0, 16)
}

/** Path of the hook chat-state file for a working directory. */
export function hookStateFilePath(workingDir) {
  return path.join(os.homedir(), '.aimaestro', 'chat-state', `${hashCwd(workingDir)}.json`)
}

/**
 * Read the hook chat-state file for a working directory.
 * Non-waiting states expire after 60s; a missing/unparseable updatedAt counts
 * as expired (previously `Date.now() - NaN > 60000` was false, so stale states
 * were served forever).
 */
export function readHookState(workingDir) {
  if (!workingDir) return null
  const stateFile = hookStateFilePath(workingDir)
  try {
    if (fs.existsSync(stateFile)) {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
      const isWaitingState = state.status === 'waiting_for_input' || state.status === 'permission_request'
      if (!isWaitingState) {
        const updatedAtMs = new Date(state.updatedAt).getTime()
        if (!Number.isFinite(updatedAtMs) || Date.now() - updatedAtMs > 60000) return null
      }
      return state
    }
  } catch { /* ignore */ }
  return null
}
