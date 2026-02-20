/**
 * Agents Chat Service
 *
 * Business logic for reading agent conversations and sending messages.
 * Routes are thin wrappers that call these functions.
 */

import { getAgent } from '@/lib/agent-registry'
import { getRuntime } from '@/lib/agent-runtime'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import os from 'os'

// ── Types ───────────────────────────────────────────────────────────────────

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function hashCwd(cwd: string): string {
  return crypto.createHash('md5').update(cwd || '').digest('hex').substring(0, 16)
}

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
    return { error: 'Agent not found', status: 404 }
  }

  const { since, limit = 100 } = options

  const workingDir = agent.workingDirectory ||
                     agent.sessions?.[0]?.workingDirectory ||
                     agent.preferences?.defaultWorkingDirectory

  if (!workingDir) {
    return { error: 'Agent has no working directory configured', status: 400 }
  }

  // Find the Claude conversation directory for this project
  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')
  const projectDirName = workingDir.replace(/\//g, '-')
  const conversationDir = path.join(claudeProjectsDir, projectDirName)

  if (!fs.existsSync(conversationDir)) {
    return {
      data: {
        success: true,
        messages: [],
        conversationFile: null,
        message: 'No conversation directory found for this project'
      },
      status: 200
    }
  }

  // Find the most recently modified .jsonl file
  const files = fs.readdirSync(conversationDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({
      name: f,
      path: path.join(conversationDir, f),
      mtime: fs.statSync(path.join(conversationDir, f)).mtime
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

  if (files.length === 0) {
    return {
      data: {
        success: true,
        messages: [],
        conversationFile: null,
        message: 'No conversation files found'
      },
      status: 200
    }
  }

  const currentConversation = files[0]

  // Read and parse the JSONL file
  const fileContent = fs.readFileSync(currentConversation.path, 'utf-8')
  const lines = fileContent.split('\n').filter(line => line.trim())

  const sinceTime = since ? new Date(since).getTime() : 0
  const messages: any[] = []

  for (const line of lines) {
    try {
      const message = JSON.parse(line)

      if (since && message.timestamp) {
        const msgTime = new Date(message.timestamp).getTime()
        if (msgTime <= sinceTime) continue
      }

      // Extract thinking blocks from assistant messages
      if (message.type === 'assistant' && message.message?.content) {
        const content = message.message.content
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'thinking' && block.thinking) {
              messages.push({
                type: 'thinking',
                thinking: block.thinking,
                timestamp: message.timestamp,
                uuid: message.uuid
              })
            }
          }
        }
      }

      messages.push(message)
    } catch {
      // Skip malformed lines
    }
  }

  const limitedMessages = messages.slice(-limit)

  // Read hook state file
  let hookState: any = null
  if (workingDir) {
    const stateDir = path.join(os.homedir(), '.aimaestro', 'chat-state')
    const cwdHash = hashCwd(workingDir)
    const stateFile = path.join(stateDir, `${cwdHash}.json`)

    try {
      if (fs.existsSync(stateFile)) {
        const stateContent = fs.readFileSync(stateFile, 'utf-8')
        hookState = JSON.parse(stateContent)

        const isWaitingState = hookState.status === 'waiting_for_input' || hookState.status === 'permission_request'
        if (!isWaitingState) {
          const stateAge = Date.now() - new Date(hookState.updatedAt).getTime()
          if (stateAge > 60000) {
            hookState = null
          }
        }
      }
    } catch {
      // Ignore state read errors
    }
  }

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
export async function sendChatMessage(
  agentId: string,
  message: string
): Promise<ServiceResult<Record<string, unknown>>> {
  if (!message || typeof message !== 'string') {
    return { error: 'Message is required', status: 400 }
  }

  const agent = getAgent(agentId)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
  }

  const sessionName = agent.name || agent.alias
  if (!sessionName) {
    return { error: 'Agent has no session name', status: 400 }
  }

  const hasOnlineSession = agent.sessions?.some(s => s.status === 'online')
  if (!hasOnlineSession) {
    return { error: 'Agent session is not online', status: 400 }
  }

  const runtime = getRuntime()
  await runtime.sendKeys(sessionName, message, { literal: true, enter: true })

  console.log('[Chat Service] Message sent successfully')

  return {
    data: {
      success: true,
      message: 'Message sent to session',
      sessionName
    },
    status: 200
  }
}
