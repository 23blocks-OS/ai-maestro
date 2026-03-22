/**
 * Creation Helper Service
 *
 * Manages the Haephestos agent creation helper — a temporary Claude Code session
 * that guides users through creating and configuring new AI agents.
 *
 * Architecture: follows the same pattern as help-service.ts (temp tmux session +
 * claude CLI + capture-pane response polling).  The key difference is that this
 * service uses `--agent haephestos-creation-helper` instead of `--system-prompt`,
 * and provides message relay + response capture for the chat UI.
 *
 * Covers:
 *   POST   /api/agents/creation-helper/session   -> createCreationHelper
 *   DELETE /api/agents/creation-helper/session   -> deleteCreationHelper
 *   GET    /api/agents/creation-helper/session   -> getCreationHelperStatus
 *   POST   /api/agents/creation-helper/chat      -> sendMessage
 *   GET    /api/agents/creation-helper/response   -> captureResponse
 */

import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { getAgentByName, createAgent, deleteAgent } from '@/lib/agent-registry'
import { parseNameForDisplay } from '@/types/agent'
import { getRuntime } from '@/lib/agent-runtime'
import type { ServiceResult } from '@/types/service'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_NAME = '_aim-creation-helper'
const SESSION_LABEL = 'Agent Creation Helper'
const AGENT_FILE_NAME = 'haephestos-creation-helper.md'
const LOG_PREFIX = '[CreationHelper]'

// Sonnet for intelligent config suggestions; haiku would be too limited
const MODEL = 'sonnet'
// Haephestos needs Bash (for PSS binary, jq, curl), Write (for TOML drafts), and Agent (for PSS subagent)
const TOOLS = 'Read,Write,Bash,Glob,Grep,Agent'
// Default mode: allow list auto-approves expected ops, anything not in allow/deny prompts.
// This enforces "writes only inside haephestos" — Write outside workspace triggers a prompt.
const PERMISSION_MODE = 'default'

// ANSI escape code stripper — removes SGR, cursor movement, erase, and DEC Private Mode sequences
const ANSI_RE = /\x1B(?:\[[?]?[0-9;]*[a-zA-Z]|\].*?(?:\x07|\x1B\\)|\(B)/g

// Simple djb2 hash for response deduplication
function simpleHash(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}

// Tracks the response visible when the last message was sent, to prevent
// returning the same (stale) response before Claude starts its new reply.
let staleResponseHash: string | null = null

// ---------------------------------------------------------------------------
// Watchdog: auto-kill session if browser disconnects
// ---------------------------------------------------------------------------

// The agent-creation page sends heartbeats every 30s.
// If no heartbeat is received for WATCHDOG_TIMEOUT_MS, the session is killed.
// This prevents zombie sessions from running indefinitely if the browser
// tab closes without triggering beforeunload cleanup.
const WATCHDOG_TIMEOUT_MS = 2 * 60 * 1000 // 2 minutes
let lastHeartbeat: number = 0
let watchdogTimer: ReturnType<typeof setInterval> | null = null

/** Called by the heartbeat endpoint to keep the session alive. */
export function heartbeatCreationHelper(): void {
  lastHeartbeat = Date.now()
}

function startWatchdog(): void {
  stopWatchdog()
  lastHeartbeat = Date.now()
  watchdogTimer = setInterval(async () => {
    if (lastHeartbeat === 0) return
    const elapsed = Date.now() - lastHeartbeat
    if (elapsed > WATCHDOG_TIMEOUT_MS) {
      console.warn(`${LOG_PREFIX} Watchdog: no heartbeat for ${Math.round(elapsed / 1000)}s — killing zombie session`)
      stopWatchdog()
      await deleteCreationHelper()
    }
  }, 30_000) // Check every 30s
}

function stopWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer)
    watchdogTimer = null
  }
  lastHeartbeat = 0
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Check if the creation helper tmux session exists. */
async function sessionExists(): Promise<boolean> {
  const runtime = getRuntime()
  return runtime.sessionExists(SESSION_NAME)
}

/** Path to the source agent persona file (checked into the repo). */
function sourceAgentFile(): string {
  return join(process.cwd(), 'agents', AGENT_FILE_NAME)
}

/** Path where the agent file is deployed for `claude --agent`. */
function deployedAgentFile(): string {
  return join(process.cwd(), '.claude', 'agents', AGENT_FILE_NAME)
}

/** Copy the agent persona file to .claude/agents/ so `claude --agent` finds it. */
function deployAgentFile(): void {
  const src = sourceAgentFile()
  const dst = deployedAgentFile()
  const dstDir = join(process.cwd(), '.claude', 'agents')

  if (!existsSync(src)) {
    throw new Error(`Agent file not found: ${src}`)
  }
  if (!existsSync(dstDir)) {
    mkdirSync(dstDir, { recursive: true })
  }
  copyFileSync(src, dst)
}

/** Remove the deployed agent file (cleanup on session destruction). */
function removeAgentFile(): void {
  const dst = deployedAgentFile()
  try {
    if (existsSync(dst)) unlinkSync(dst)
  } catch {
    // Ignore removal failures — non-critical cleanup
  }
}

/**
 * Sanitize user input: strip null bytes, ASCII control chars (except newline/tab),
 * and Unicode bidi-override characters.
 */
function sanitizeInput(text: string): string {
  return text
    .replace(/\0/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, '')
}

/** Strip ANSI escape codes from captured terminal output. */
function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '')
}

/**
 * Parse JSON config suggestion blocks from Claude's response.
 *
 * Claude Code's terminal renderer strips markdown code fences, so
 * ```json:config blocks appear as plain indented JSON in the captured pane.
 * We detect config arrays by finding JSON arrays whose objects all have
 * the {action, field, value} shape.  Returns the suggestions and the
 * response text with the config blocks removed.
 */
function parseConfigBlocks(text: string): {
  cleanText: string
  suggestions: Array<{ action: string; field: string; value: unknown }>
} {
  const suggestions: Array<{ action: string; field: string; value: unknown }>  = []

  // Strategy 1: fenced ```json:config blocks (works if source is raw markdown)
  const configBlockRe = /```json:config\s*\n([\s\S]*?)```/g
  let cleanText = text.replace(configBlockRe, (_match, content: string) => {
    try {
      const parsed = JSON.parse(content.trim())
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object' && item.action && item.field && 'value' in item) {
            suggestions.push(item)
          }
        }
      }
    } catch {
      console.warn(`${LOG_PREFIX} Failed to parse fenced config block:`, content.slice(0, 100))
      return _match
    }
    return ''
  }).trim()

  // Strategy 2: raw JSON arrays in terminal output (fences stripped by renderer).
  // Find lines starting with '[', collect until matching ']', try to parse.
  if (suggestions.length === 0) {
    const lines = cleanText.split('\n')
    let blockStart = -1
    let bracketDepth = 0
    let blockLines: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      // Detect JSON array start — may follow ⏺ response marker or indentation
      const bracketPos = trimmed.indexOf('[')
      if (blockStart < 0 && bracketPos >= 0 &&
          (bracketPos === 0 || /^[⏺\s]+$/.test(trimmed.slice(0, bracketPos)))) {
        blockStart = i
        bracketDepth = 0
        blockLines = []
      }
      if (blockStart >= 0) {
        blockLines.push(lines[i])
        for (const ch of trimmed) {
          if (ch === '[') bracketDepth++
          else if (ch === ']') bracketDepth--
        }
        if (bracketDepth <= 0) {
          // Potential complete JSON array — try to parse.
          // Terminal wrapping inserts newlines inside JSON string values,
          // so join all lines with spaces to normalize before parsing.
          const candidate = blockLines
            .map(l => l.trim().replace(/^⏺\s*/, ''))  // Strip response marker
            .join(' ')
          try {
            const parsed = JSON.parse(candidate)
            if (Array.isArray(parsed) && parsed.length > 0 &&
                parsed.every((item: unknown) =>
                  item && typeof item === 'object' &&
                  'action' in (item as Record<string, unknown>) &&
                  'field' in (item as Record<string, unknown>) &&
                  'value' in (item as Record<string, unknown>)
                )) {
              for (const item of parsed) {
                suggestions.push(item as { action: string; field: string; value: unknown })
              }
              // Remove the config block lines from the visible text
              lines.splice(blockStart, i - blockStart + 1)
              cleanText = lines.join('\n').trim()
              break
            }
          } catch {
            // Not valid JSON — reset and keep scanning
          }
          blockStart = -1
          blockLines = []
        }
      }
    }
  }

  return { cleanText, suggestions }
}

/**
 * Detect whether Claude has finished responding by examining captured pane content.
 *
 * Mirrors the detection logic from agents-chat-service.ts:175-229:
 * 1. Check if Claude is still thinking (keywords in recent lines)
 * 2. Look for separator lines (─╌═ repeated 10+ times)
 * 3. Check for input prompt (> ) between separators → response complete
 */
function detectResponseState(capturedLines: string[]): {
  isThinking: boolean
  isComplete: boolean
  responseText: string
} {
  const recentLines = capturedLines.slice(-15)
  const recentText = recentLines.join('\n').toLowerCase()

  // Check thinking indicators.
  // Claude Code shows "<spinner> <whimsical-word>… (Ns · tokens)" while thinking.
  // The spinner character rotates (·, ✶, ✢, ✻, etc.) and the word changes
  // across versions, so we detect the consistent "<word>… (<time>" pattern.
  const hasThinkingIndicator = recentLines.some(l => {
    const stripped = stripAnsi(l).trim()
    return stripped.match(/\S+…\s+\(\d+[ms]/)
  })

  // Check for active tool/sub-agent execution.
  // When Haephestos spawns a sub-agent (e.g. PSS profiler), the terminal shows
  // tool invocation output like "+69 more tool uses (ctrl+o to expand)" and
  // "ctrl+b ctrl+b (twice) to run in background". The thinking spinner may scroll
  // out of the visible last 15 lines during long-running sub-agents, so we scan
  // ALL captured lines for active tool execution markers.
  const hasActiveToolCall = capturedLines.some(l => {
    const stripped = stripAnsi(l).trim()
    return (
      stripped.match(/^\+\d+ more tool uses?/) ||       // "+N more tool uses"
      stripped.includes('ctrl+o to expand') ||            // tool output collapsed
      stripped.includes('ctrl+b ctrl+b') ||               // "run in background" hint
      stripped.match(/^\s*⎿\s+(Read|Write|Edit|Bash)\(/)  // active tool invocation line
    )
  })
  // Only treat tool markers as "still running" if there is no completed response
  // below them (i.e., the tool marker is in the last response region, not a prior one).
  // We check this by verifying tool markers appear AFTER the last separator pair.
  let toolCallIsRecent = false
  if (hasActiveToolCall) {
    // Find the last separator line index
    let lastSepIdx = -1
    for (let i = capturedLines.length - 1; i >= 0; i--) {
      const line = capturedLines[i].trim()
      if (line.match(/^[─╌═]{10,}/) && !line.match(/[╮╯┤│]$/)) {
        lastSepIdx = i
        break
      }
    }
    // Check if any tool marker appears after the second-to-last separator
    // (i.e., within the current response region)
    for (let i = Math.max(0, lastSepIdx); i < capturedLines.length; i++) {
      const stripped = stripAnsi(capturedLines[i]).trim()
      if (
        stripped.match(/^\+\d+ more tool uses?/) ||
        stripped.includes('ctrl+o to expand') ||
        stripped.includes('ctrl+b ctrl+b')
      ) {
        toolCallIsRecent = true
        break
      }
    }
  }

  const isThinking = hasThinkingIndicator || toolCallIsRecent ||
    recentText.includes('thinking') ||
    recentText.includes('analyzing') ||
    recentText.includes('generating') ||
    recentText.includes('processing') ||
    (recentText.includes('esc to interrupt') && !recentText.includes('esc to cancel'))

  if (isThinking) {
    return { isThinking: true, isComplete: false, responseText: '' }
  }

  // Find separator lines (bottom-up)
  // Claude v2.x separators may contain text (e.g. "────── agent-name ──")
  // so we match lines that START with 10+ separator chars.
  // Exclude cost-box continuation lines that end with box-drawing chars (╮╯┤│)
  const separators: number[] = []
  for (let i = capturedLines.length - 1; i >= 0; i--) {
    const line = capturedLines[i].trim()
    if (line.match(/^[─╌═]{10,}/) && !line.match(/[╮╯┤│]$/)) {
      separators.push(i)
      if (separators.length === 3) break
    }
  }

  // Need at least 2 separators to delimit a response
  if (separators.length < 2) {
    return { isThinking: false, isComplete: false, responseText: '' }
  }

  // Claude v2.x terminal layout (bottom-up):
  //   ⏵⏵ bypass permissions on (shift+tab to cycle)    ← chrome
  //   🤖 Sonnet 4.6 ... | 📁 project | 📊 tokens      ← chrome (status bar)
  //   ────────────────────────────────────────────────  ← bottomSep (separators[0])
  //   ❯                                                ← input prompt
  //   ────────────────── agent-name ──────────────────  ← topSep (separators[1])
  //   [Claude's response text]                          ← what we want
  //   ────────────────────────────────────────────────  ← prevSep (separators[2])
  //
  // Check if the prompt area between topSep and bottomSep contains the input prompt
  const [bottomSep, topSep] = separators
  const betweenSeps = capturedLines.slice(topSep + 1, bottomSep)
    .map(l => l.trim())
    .filter(l => l)

  // The prompt area should contain just the ❯ or > character (possibly with user text)
  const hasPrompt = betweenSeps.length <= 1 &&
    (betweenSeps.length === 0 || betweenSeps[0].match(/^[>❯]/))

  if (!hasPrompt) {
    return { isThinking: false, isComplete: false, responseText: '' }
  }

  // Determine response start boundary
  let responseStart: number
  if (separators.length >= 3) {
    // Standard case: 3+ separators — response is between prevSep and topSep
    responseStart = separators[2] + 1
  } else {
    // First response case: only 2 separators (no prevSep above the response).
    // Find the user's message line above topSep (❯ followed by text) and use
    // the area after it (skipping hook notifications) as the response start.
    let userMsgLine = -1
    for (let i = topSep - 1; i >= 0; i--) {
      const stripped = stripAnsi(capturedLines[i]).trim()
      if (stripped.match(/^[❯>]\s+\S/)) {
        userMsgLine = i
        break
      }
    }
    if (userMsgLine < 0) {
      // No user message found — initial state, prompt is ready but no response
      return { isThinking: false, isComplete: true, responseText: '' }
    }
    // Find the first response marker (⏺) after the user message.  This skips
    // multi-line hook notifications (⎿ prefix + indented continuation lines).
    responseStart = userMsgLine + 1
    while (responseStart < topSep) {
      const stripped = stripAnsi(capturedLines[responseStart]).trim()
      if (stripped.startsWith('⏺')) break
      responseStart++
    }
    if (responseStart >= topSep) {
      // No response marker found — Claude may still be processing
      return { isThinking: false, isComplete: true, responseText: '' }
    }
  }

  // Strip cost box: find "⎿  Stop says:" marker and truncate there.
  // Everything from that marker to topSep is noise (cost box, "Worked for", etc.)
  let responseEnd = topSep
  for (let i = responseStart; i < topSep; i++) {
    const stripped = stripAnsi(capturedLines[i]).trim()
    if (stripped.match(/^⎿\s+Stop says/)) {
      responseEnd = i
      break
    }
  }
  // Also strip trailing empty lines
  while (responseEnd > responseStart && stripAnsi(capturedLines[responseEnd - 1]).trim() === '') {
    responseEnd--
  }

  const responseLines = capturedLines.slice(responseStart, responseEnd)
  const responseText = stripAnsi(responseLines.join('\n')).trim()

  return { isThinking: false, isComplete: true, responseText }
}

// ===========================================================================
// PUBLIC API — called by API routes
// ===========================================================================

/**
 * Create or return existing creation helper agent.
 */
export async function createCreationHelper(): Promise<ServiceResult<{
  success: boolean
  agentId: string
  name: string
  status: string
  created: boolean
}>> {
  try {
    let agent = getAgentByName(SESSION_NAME)
    const exists = await sessionExists()

    // Already running — return it (idempotent)
    if (agent && exists) {
      return {
        data: {
          success: true,
          agentId: agent.id,
          name: SESSION_NAME,
          status: 'online',
          created: false,
        },
        status: 200,
      }
    }

    // Clean up stale registry entry if session is gone
    if (agent && !exists) {
      try { await deleteAgent(agent.id) } catch { /* ignore */ }
      agent = null
    }

    // Deploy agent persona file to .claude/agents/
    deployAgentFile()

    // Create tmux session in the AI Maestro project directory
    const runtime = getRuntime()
    const cwd = process.cwd()
    await runtime.createSession(SESSION_NAME, cwd)

    // Register agent in registry
    if (!agent) {
      const { tags } = parseNameForDisplay(SESSION_NAME)
      agent = await createAgent({
        name: SESSION_NAME,
        label: SESSION_LABEL,
        program: 'claude-code',
        taskDescription: 'Temporary agent creation helper (Haephestos)',
        tags,
        owner: 'system',
        createSession: true,
        workingDirectory: cwd,
        programArgs: '',
      })
    }

    // Unset CLAUDECODE env to avoid nested-session detection
    await runtime.unsetEnvironment(SESSION_NAME, 'CLAUDECODE')
    await runtime.sendKeys(SESSION_NAME, '"unset CLAUDECODE"', { enter: true })

    // Small delay for env to take effect
    await new Promise(resolve => setTimeout(resolve, 300))

    // Launch claude with the Haephestos agent persona
    const launchCmd = [
      'claude',
      `--agent ${AGENT_FILE_NAME.replace('.md', '')}`,
      `--model ${MODEL}`,
      `--tools ${TOOLS}`,
      `--permission-mode ${PERMISSION_MODE}`,
    ].join(' ')

    await runtime.sendKeys(SESSION_NAME, launchCmd, { literal: true, enter: true })

    // Start watchdog — auto-kills session if browser disconnects
    startWatchdog()

    return {
      data: {
        success: true,
        agentId: agent.id,
        name: SESSION_NAME,
        status: 'starting',
        created: true,
      },
      status: 200,
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to create:`, error)
    return {
      data: {
        success: false,
        agentId: '',
        name: SESSION_NAME,
        status: 'error',
        created: false,
      },
      error: error instanceof Error ? error.message : 'Failed to create creation helper',
      status: 500,
    }
  }
}

/**
 * Kill creation helper agent and clean up.
 */
export async function deleteCreationHelper(): Promise<ServiceResult<{ success: boolean }>> {
  // Stop watchdog timer — session is being intentionally destroyed
  stopWatchdog()
  // Reset stale response tracking on session destruction
  staleResponseHash = null
  try {
    // Kill tmux session
    const runtime = getRuntime()
    const exists = await sessionExists()
    if (exists) {
      try { await runtime.killSession(SESSION_NAME) } catch { /* ignore */ }
    }

    // Remove from agent registry
    const agent = getAgentByName(SESSION_NAME)
    if (agent) {
      try { await deleteAgent(agent.id) } catch { /* ignore */ }
    }

    // Clean up deployed agent file
    removeAgentFile()

    return { data: { success: true }, status: 200 }
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to delete:`, error)
    return {
      error: error instanceof Error ? error.message : 'Failed to delete creation helper',
      status: 500,
    }
  }
}

/**
 * Check creation helper status and whether Claude is ready for input.
 */
export async function getCreationHelperStatus(): Promise<ServiceResult<{
  success: boolean
  agentId: string | null
  name: string
  status: string
  ready: boolean
}>> {
  try {
    const agent = getAgentByName(SESSION_NAME)
    const exists = await sessionExists()

    if (!agent || !exists) {
      return {
        data: {
          success: true,
          agentId: null,
          name: SESSION_NAME,
          status: 'offline',
          ready: false,
        },
        status: 200,
      }
    }

    // Capture pane to detect if Claude is ready (showing input prompt)
    const runtime = getRuntime()
    const stdout = await runtime.capturePane(SESSION_NAME, 30)
    const lines = stdout.trim().split('\n')
    const state = detectResponseState(lines)

    return {
      data: {
        success: true,
        agentId: agent.id,
        name: SESSION_NAME,
        status: state.isComplete ? 'ready' : state.isThinking ? 'thinking' : 'starting',
        ready: state.isComplete,
      },
      status: 200,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    }
  }
}

/**
 * Send a user message to the creation helper Claude session.
 */
export async function sendMessage(text: string): Promise<ServiceResult<{ success: boolean }>> {
  try {
    const exists = await sessionExists()
    if (!exists) {
      return {
        error: 'Creation helper session not running',
        status: 404,
      }
    }

    const sanitized = sanitizeInput(text)
    if (!sanitized.trim()) {
      return {
        error: 'Empty message after sanitization',
        status: 400,
      }
    }

    const runtime = getRuntime()

    // Snapshot current response hash so captureResponse() can detect stale data
    try {
      const stdout = await runtime.capturePane(SESSION_NAME, 200)
      const lines = stdout.trim().split('\n')
      const state = detectResponseState(lines)
      if (state.isComplete && state.responseText) {
        staleResponseHash = simpleHash(state.responseText)
      }
    } catch { /* non-critical — worst case: one duplicate response */ }

    await runtime.sendKeys(SESSION_NAME, sanitized, { literal: true, enter: true })

    return { data: { success: true }, status: 200 }
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to send message:`, error)
    return {
      error: error instanceof Error ? error.message : 'Failed to send message',
      status: 500,
    }
  }
}

/**
 * Capture Claude's response from the terminal.
 *
 * This is a single-shot capture (no internal polling).  The UI polls this
 * endpoint repeatedly until `isComplete` is true.
 */
export async function captureResponse(): Promise<ServiceResult<{
  text: string
  configSuggestions: Array<{ action: string; field: string; value: unknown }>
  isComplete: boolean
  isThinking: boolean
}>> {
  try {
    const exists = await sessionExists()
    if (!exists) {
      return {
        error: 'Creation helper session not running',
        status: 404,
      }
    }

    const runtime = getRuntime()
    const stdout = await runtime.capturePane(SESSION_NAME, 200)
    const lines = stdout.trim().split('\n')
    const state = detectResponseState(lines)

    if (!state.isComplete) {
      return {
        data: {
          text: '',
          configSuggestions: [],
          isComplete: false,
          isThinking: state.isThinking,
        },
        status: 200,
      }
    }

    // Check for stale response (old response still visible after new message sent)
    if (staleResponseHash) {
      const hash = simpleHash(state.responseText)
      if (hash === staleResponseHash) {
        // Same response as before — Claude hasn't started replying yet
        return {
          data: { text: '', configSuggestions: [], isComplete: false, isThinking: false },
          status: 200,
        }
      }
      // New response detected — clear stale tracking
      staleResponseHash = null
    }

    // Parse config suggestion blocks from response
    const { cleanText, suggestions } = parseConfigBlocks(state.responseText)

    return {
      data: {
        text: cleanText,
        configSuggestions: suggestions,
        isComplete: true,
        isThinking: false,
      },
      status: 200,
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to capture response:`, error)
    return {
      error: error instanceof Error ? error.message : 'Failed to capture response',
      status: 500,
    }
  }
}
