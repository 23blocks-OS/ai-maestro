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

import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

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

/** Convenience wrapper taking a registry agent. */
export function resolveJsonlPath(agent) {
  return resolveJsonlPathForDir(getAgentWorkingDir(agent))
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

      // A message sent while the agent is BUSY is queued by Claude Code and
      // recorded as an attachment, not a user turn:
      //
      //   { type: 'attachment',
      //     attachment: { type: 'queued_command', prompt: '…' } }
      //
      // Nothing produced the `queue-operation` shape the UI consumes in nine
      // places — it was read for, never written. So a queued message neither
      // rendered as queued nor reconciled its pending bubble, and the bubble
      // spun to "Not confirmed" for a message that was perfectly fine. Found on
      // a live agent: 5 queued_command entries in one transcript, every one of
      // them invisible to the chat.
      if (message.type === 'attachment' && message.attachment?.type === 'queued_command') {
        messages.push({
          type: 'queue-operation',
          operation: 'enqueue',
          content: message.attachment.prompt || '',
          timestamp: message.timestamp,
          uuid: message.uuid,
        })
        continue
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
  return messages.slice(-limit)
}

/** Hash a working directory the way the chat-state hook does. */
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
