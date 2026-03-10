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
// Read-only tools — the helper can browse skills/plugins catalogs but never modify
const TOOLS = 'Read,Glob,Grep,Agent'
const PERMISSION_MODE = 'bypassPermissions'

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
 * Looks for fenced code blocks tagged `json:config` containing arrays of
 * ConfigSuggestion objects.  Returns the suggestions and the response text
 * with the config blocks removed (so the UI shows only conversational text).
 */
function parseConfigBlocks(text: string): {
  cleanText: string
  suggestions: Array<{ action: string; field: string; value: unknown }>
} {
  const suggestions: Array<{ action: string; field: string; value: unknown }>  = []

  // Match ```json:config ... ``` blocks
  const configBlockRe = /```json:config\s*\n([\s\S]*?)```/g
  const cleanText = text.replace(configBlockRe, (_match, content: string) => {
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
      // Malformed JSON in config block — ignore, show as regular text
      console.warn(`${LOG_PREFIX} Failed to parse config block:`, content.slice(0, 100))
      return _match // Keep the block visible if we can't parse it
    }
    return '' // Remove successfully parsed config blocks from visible text
  }).trim()

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

  // Check thinking indicators
  const isThinking = recentText.includes('elucidating') ||
    recentText.includes('thinking') ||
    recentText.includes('analyzing') ||
    recentText.includes('generating') ||
    recentText.includes('processing') ||
    (recentText.includes('esc to interrupt') && !recentText.includes('esc to cancel'))

  if (isThinking) {
    return { isThinking: true, isComplete: false, responseText: '' }
  }

  // Find separator lines (bottom-up)
  const separators: number[] = []
  for (let i = capturedLines.length - 1; i >= 0; i--) {
    const line = capturedLines[i].trim()
    if (line.match(/^[─╌═]{10,}$/)) {
      separators.push(i)
      if (separators.length === 3) break // Need up to 3: top of response, bottom of response, input prompt area
    }
  }

  // Need at least 2 separators to delimit a response
  if (separators.length < 2) {
    return { isThinking: false, isComplete: false, responseText: '' }
  }

  // Check if the area below the bottom separator has an input prompt
  const [bottomSep, topSep] = separators
  const afterBottom = capturedLines.slice(bottomSep + 1)
    .map(l => l.trim())
    .filter(l => l)

  const isInputPrompt = afterBottom.length <= 1 &&
    (afterBottom.length === 0 || afterBottom[0].match(/^>\s*$/))

  if (!isInputPrompt) {
    return { isThinking: false, isComplete: false, responseText: '' }
  }

  // Extract response text between separators
  const responseLines = capturedLines.slice(topSep + 1, bottomSep)
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
