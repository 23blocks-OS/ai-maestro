/**
 * Agents Chat Service
 *
 * Business logic for reading agent conversations and sending messages.
 * Routes are thin wrappers that call these functions.
 */

import { getAgent } from '@/lib/agent-registry'
import { getRuntime } from '@/lib/agent-runtime'
import { isPaneAtBareShell, BARE_SHELL_MESSAGE } from '@/lib/pane-occupant'
import { paneSubmitted, paneStaged, stripDimPlaceholder, clearInputKeys } from '@/lib/notification-service'
import {
  enqueueForSession,
  shouldUseAdditionalContext,
  sanitizeForRawInject,
  wrapAsBracketedPaste,
} from '@/lib/meeting-inject-queue'
import * as fs from 'fs'
import { type ServiceResult, notFound, invalidRequest, missingField } from '@/services/service-errors'
// Shared transcript logic — single source of truth with server.mjs (do not fork;
// the underscore path-encoding bug had to be fixed in 3 copies once already)
import { resolveJsonlPathForDir, parseJsonlLines, readHookState } from '@/lib/chat-transcript.mjs'

// ── Public Functions ────────────────────────────────────────────────────────

/**
 * Get messages from the agent's current conversation JSONL file.
 */
export async function getConversationMessages(
  agentId: string,
  options: { since?: string | null; limit?: number }
): Promise<ServiceResult<Record<string, unknown>>> {
  const agent = getAgent(agentId)
  if (!agent) {
    return notFound('Agent', agentId)
  }

  const { since, limit = 100 } = options

  const workingDir = agent.workingDirectory ||
                     agent.sessions?.[0]?.workingDirectory ||
                     agent.preferences?.defaultWorkingDirectory

  if (!workingDir) {
    return invalidRequest('Agent has no working directory configured')
  }

  // Find the current conversation JSONL (shared logic with server.mjs)
  const currentConversation = resolveJsonlPathForDir(workingDir)
  if (!currentConversation) {
    return {
      data: {
        success: true,
        messages: [],
        conversationFile: null,
        message: 'No conversation found for this project'
      },
      status: 200
    }
  }

  // Read and parse the JSONL file
  const fileContent = fs.readFileSync(currentConversation.path, 'utf-8')
  const lines = fileContent.split('\n')

  let messages: any[] = parseJsonlLines(lines, Number.MAX_SAFE_INTEGER)
  if (since) {
    const sinceTime = new Date(since).getTime()
    messages = messages.filter(m =>
      !m.timestamp || new Date(m.timestamp).getTime() > sinceTime
    )
  }

  const limitedMessages = messages.slice(-limit)

  // Read hook state file (shared logic with server.mjs)
  const hookState: any = readHookState(workingDir)

  // Capture tmux to detect prompts waiting for input
  let terminalPrompt: string | null = null
  let promptType: 'permission' | 'input' | null = null
  const hasOnlineSession = agent.sessions?.some((s: any) => s.status === 'online')
  if (hasOnlineSession) {
    const sessionName = agent.name || agent.alias
    if (sessionName) {
      try {
        const runtime = getRuntime()
        const stdout = await runtime.capturePane(sessionName, 40)
        const tmuxLines = stdout.trim().split('\n')
        const recentLines = tmuxLines.slice(-10)
        const recentText = recentLines.join('\n').toLowerCase()

        const isThinking = recentText.includes('elucidating') ||
                           recentText.includes('thinking') ||
                           recentText.includes('analyzing') ||
                           recentText.includes('generating') ||
                           recentText.includes('processing') ||
                           (recentText.includes('esc to interrupt') && !recentText.includes('esc to cancel'))

        if (!isThinking) {
          const separators: number[] = []

          for (let i = recentLines.length - 1; i >= 0; i--) {
            const line = recentLines[i].trim()
            if (line.match(/^[─╌═]{10,}$/)) {
              separators.push(i)
              if (separators.length === 2) break
            }
          }

          let promptContent: string[] = []
          if (separators.length === 2) {
            const [bottomSep, topSep] = separators
            promptContent = recentLines.slice(topSep + 1, bottomSep)
              .map(l => l.trim())
              .filter(l => l)
          }

          const promptText = promptContent.join('\n')
          const isOnlyInputPrompt = promptContent.length === 1 && promptContent[0].match(/^>\s*$/)

          const hasPermissionIndicator = promptContent.some(line =>
            line.startsWith('Do you want to') ||
            line.match(/^❯\s*\d+\./) ||
            line.match(/^\d+\.\s+(Yes|No|Type|Skip)/) ||
            line.startsWith('Esc to cancel')
          )

          if (hasPermissionIndicator && promptContent.length > 0) {
            terminalPrompt = promptText
            promptType = 'permission'
          } else if (isOnlyInputPrompt) {
            terminalPrompt = 'Ready for input'
            promptType = 'input'
          }
        }
      } catch {
        // Ignore tmux capture errors
      }
    }
  }

  return {
    data: {
      success: true,
      messages: limitedMessages,
      conversationFile: currentConversation.path,
      totalMessages: messages.length,
      lastModified: currentConversation.mtime.toISOString(),
      hookState,
      terminalPrompt,
      promptType
    },
    status: 200
  }
}

/**
 * Send a message to the agent's Claude session via tmux.
 */
/** Polls per send attempt, ~250ms apart: a TUI can take a moment to echo. */
const CHAT_VERIFY_POLLS = 12
const CHAT_POLL_INTERVAL_MS = 250
/** One retry. If a modal is holding the keyboard, a third try will not help. */
const CHAT_MAX_SENDS = 2

export const CHAT_NOT_SUBMITTED_MESSAGE =
  'Your message reached the agent\'s input box but was never submitted — something in the ' +
  'terminal is holding the keyboard, usually a prompt or dialog waiting for an answer. ' +
  'Open this agent\'s terminal, clear whatever is waiting, and send again.'

export async function sendChatMessage(
  agentId: string,
  message: string
): Promise<ServiceResult<Record<string, unknown>>> {
  if (!message || typeof message !== 'string') {
    return missingField('message')
  }

  const agent = getAgent(agentId)
  if (!agent) {
    return notFound('Agent', agentId)
  }

  const sessionName = agent.name || agent.alias
  if (!sessionName) {
    return invalidRequest('Agent has no session name')
  }

  const hasOnlineSession = agent.sessions?.some(s => s.status === 'online')
  if (!hasOnlineSession) {
    return invalidRequest('Agent session is not online')
  }

  // `online` means the tmux session EXISTS, not that an agent is running in it.
  // Without this guard a pane sitting at a shell prompt accepts the message and
  // bash executes it — reported on a fresh install (#426) as
  // "Steve: command not found".
  if (await isPaneAtBareShell(sessionName)) {
    console.warn(`[Chat Service] Refusing to send to ${sessionName}: pane is at a bare shell`)
    return invalidRequest(BARE_SHELL_MESSAGE)
  }

  const runtime = getRuntime()
  await runtime.cancelCopyMode(sessionName)

  // Type it, then PROVE it was submitted.
  //
  // This used to end at sendKeys and return success. It was the last place in
  // the codebase still reporting a delivery it had not checked — and the one
  // the user sees. Reported 15 Sep 2026: a modal (Claude Code's own session
  // feedback survey) was holding the keyboard, so every chat message landed in
  // the input box unsubmitted while the UI showed each one as sent. The person
  // had to open a terminal to discover their words had gone nowhere.
  //
  // The machinery for this has existed since v0.37.x — paneSubmitted /
  // paneStaged, built for exactly this failure — and was wired into the AMP
  // notification path and nowhere else.
  for (let attempt = 1; attempt <= CHAT_MAX_SENDS; attempt++) {
    await runtime.sendKeys(sessionName, message, { literal: true, enter: true })

    for (let poll = 0; poll < CHAT_VERIFY_POLLS; poll++) {
      await new Promise(r => setTimeout(r, CHAT_POLL_INTERVAL_MS))
      const pane = stripDimPlaceholder(await runtime.capturePaneRaw(sessionName))

      if (paneSubmitted(pane, message)) {
        return {
          data: { success: true, message: 'Message sent to session', sessionName, verified: true },
          status: 200
        }
      }

      if (paneStaged(pane, message)) {
        // In the box, not submitted. Retrying without clearing would APPEND to
        // what is already there, so clear first — with backspaces, because C-u
        // does not clear this input.
        if (attempt < CHAT_MAX_SENDS) {
          const { key, repeat } = clearInputKeys(message.length)
          await runtime.repeatKey(sessionName, key, repeat)
        }
        break
      }
    }
  }

  console.warn(`[Chat Service] ${sessionName}: typed but never submitted`)
  return invalidRequest(CHAT_NOT_SUBMITTED_MESSAGE)
}

/**
 * Inject a meeting prompt into an agent's session.
 *
 * Hybrid dispatch:
 * - If the agent's program supports additionalContext (feature-gated),
 *   the text is queued and a wake-ping ("." + Enter) is sent so the hook
 *   drains the queue on the next idle_prompt.
 * - Otherwise, legacy path: sanitize + bracketed-paste + send-keys.
 */
export async function injectMeetingPrompt(
  params: { agentId?: string; agentName?: string; injection: string }
): Promise<ServiceResult<Record<string, unknown>>> {
  const { injection } = params
  if (!injection) {
    return missingField('injection')
  }

  // Resolve agent
  let agent = params.agentId ? getAgent(params.agentId) : null
  if (!agent && params.agentName) {
    // Search by name in registry
    const { getAgentByName } = await import('@/lib/agent-registry')
    agent = getAgentByName(params.agentName)
  }
  if (!agent) {
    return notFound('Agent', params.agentId || params.agentName || 'unknown')
  }

  const sessionName = agent.name || agent.alias
  if (!sessionName) {
    return invalidRequest('Agent has no session name')
  }

  const runtime = getRuntime()
  const exists = await runtime.sessionExists(sessionName)
  if (!exists) {
    return invalidRequest(`Session ${sessionName} is not active`)
  }

  // Determine program for kind detection
  const program = (agent as any).program || agent.name

  if (shouldUseAdditionalContext(program)) {
    // ── Queue path: enqueue + wake-ping ─────────────────────────────
    enqueueForSession(sessionName, injection)
    await runtime.cancelCopyMode(sessionName)
    // "." wakes Claude Code (bare Enter is a no-op); hook drains on next turn
    await runtime.sendKeys(sessionName, '.', { literal: true, enter: true })

    console.log(`[Meeting Inject] Queued for ${sessionName} (additionalContext path)`)
    return {
      data: { success: true, queued: true, sessionName },
      status: 200
    }
  }

  // Same guard as the chat path: a meeting prompt typed into a shell is
  // executed, not read.
  if (await isPaneAtBareShell(sessionName)) {
    console.warn(`[Meeting Inject] Refusing to inject into ${sessionName}: pane is at a bare shell`)
    return invalidRequest(BARE_SHELL_MESSAGE)
  }

  // ── Legacy path: sanitize + bracketed paste + send-keys ───────────
  const safe = wrapAsBracketedPaste(sanitizeForRawInject(injection))
  await runtime.cancelCopyMode(sessionName)
  await runtime.sendKeys(sessionName, safe, { literal: true, enter: true })

  console.log(`[Meeting Inject] Injected into ${sessionName} (legacy send-keys path)`)
  return {
    data: { success: true, injected: true, sessionName },
    status: 200
  }
}
