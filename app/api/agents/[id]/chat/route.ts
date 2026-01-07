import { NextRequest, NextResponse } from 'next/server'
import { getAgent } from '@/lib/agent-registry'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Hash working directory to find state file
function hashCwd(cwd: string): string {
  return crypto.createHash('md5').update(cwd || '').digest('hex').substring(0, 16)
}

/**
 * GET /api/agents/:id/chat
 * Get messages from the agent's current conversation JSONL file
 *
 * Query params:
 * - since: ISO timestamp to get only messages after this time
 * - limit: max messages to return (default 100)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const searchParams = request.nextUrl.searchParams
    const since = searchParams.get('since')
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    // Get agent from registry
    const agent = getAgent(agentId)
    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      )
    }

    // Get working directory from agent
    const workingDir = agent.workingDirectory ||
                       agent.sessions?.[0]?.workingDirectory ||
                       agent.preferences?.defaultWorkingDirectory

    if (!workingDir) {
      return NextResponse.json(
        { success: false, error: 'Agent has no working directory configured' },
        { status: 400 }
      )
    }

    // Find the Claude conversation directory for this project
    const claudeProjectsDir = path.join(require('os').homedir(), '.claude', 'projects')

    // Claude stores conversations in a directory named after the project path
    // e.g., ~/.claude/projects/-Users-juan-projects-myapp/
    // Note: The directory starts with a dash (the leading / becomes -)
    const projectDirName = workingDir.replace(/\//g, '-')
    const conversationDir = path.join(claudeProjectsDir, projectDirName)

    if (!fs.existsSync(conversationDir)) {
      return NextResponse.json({
        success: true,
        messages: [],
        conversationFile: null,
        message: 'No conversation directory found for this project'
      })
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
      return NextResponse.json({
        success: true,
        messages: [],
        conversationFile: null,
        message: 'No conversation files found'
      })
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

        // Filter by timestamp if 'since' is provided
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
      } catch (parseErr) {
        // Skip malformed lines
      }
    }

    // Apply limit (take last N messages)
    const limitedMessages = messages.slice(-limit)

    // Read hook state file to check if Claude is waiting for input
    let hookState: any = null
    if (workingDir) {
      const stateDir = path.join(require('os').homedir(), '.aimaestro', 'chat-state')
      const cwdHash = hashCwd(workingDir)
      const stateFile = path.join(stateDir, `${cwdHash}.json`)

      try {
        if (fs.existsSync(stateFile)) {
          const stateContent = fs.readFileSync(stateFile, 'utf-8')
          hookState = JSON.parse(stateContent)

          // For waiting states, keep showing until Stop hook clears it
          // For other statuses, apply 60-second freshness check
          const isWaitingState = hookState.status === 'waiting_for_input' || hookState.status === 'permission_request'
          if (!isWaitingState) {
            const stateAge = Date.now() - new Date(hookState.updatedAt).getTime()
            if (stateAge > 60000) {
              hookState = null
            }
          }

        }
      } catch (err) {
        // Ignore state read errors
      }
    }

    // For online agents, capture tmux to detect prompts waiting for input
    let terminalPrompt: string | null = null
    let promptType: 'permission' | 'input' | null = null
    const hasOnlineSession = agent.sessions?.some((s: any) => s.status === 'online')
    if (hasOnlineSession) {
      const sessionName = agent.name || agent.alias
      if (sessionName) {
        try {
          const { stdout } = await execAsync(
            `tmux capture-pane -t '${sessionName}' -p -S -40 2>/dev/null || echo ""`
          )
          const lines = stdout.trim().split('\n')

          // Check the last 10 lines for CURRENT state (not historical)
          const recentLines = lines.slice(-10)
          const recentText = recentLines.join('\n').toLowerCase()

          // First check if Claude is currently thinking/processing (NOT waiting)
          const isThinking = recentText.includes('elucidating') ||
                             recentText.includes('thinking') ||
                             recentText.includes('analyzing') ||
                             recentText.includes('generating') ||
                             recentText.includes('processing') ||
                             (recentText.includes('esc to interrupt') && !recentText.includes('esc to cancel'))

          if (!isThinking) {
            // Only look for prompts if not thinking

            // Find prompt block between separators in recent lines
            let separators: number[] = []
            let promptContent: string[] = []

            for (let i = recentLines.length - 1; i >= 0; i--) {
              const line = recentLines[i].trim()
              if (line.match(/^[─╌═]{10,}$/)) {
                separators.push(i)
                if (separators.length === 2) break
              }
            }

            // Get content between the two separators (the prompt area)
            if (separators.length === 2) {
              const [bottomSep, topSep] = separators
              promptContent = recentLines.slice(topSep + 1, bottomSep)
                .map(l => l.trim())
                .filter(l => l)
            }

            // Check what's in the prompt area
            const promptText = promptContent.join('\n')
            const isOnlyInputPrompt = promptContent.length === 1 && promptContent[0].match(/^>\s*$/)

            // Check for permission prompt indicators in the prompt area
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

        } catch (err) {
          // Ignore tmux capture errors
        }
      }
    }

    return NextResponse.json({
      success: true,
      messages: limitedMessages,
      conversationFile: currentConversation.path,
      totalMessages: messages.length,
      lastModified: currentConversation.mtime.toISOString(),
      hookState,
      terminalPrompt,
      promptType
    })
  } catch (error) {
    console.error('[Chat API] GET Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/agents/:id/chat
 * Send a message to the agent's Claude session via tmux
 *
 * Body:
 * - message: string - The message to send
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const body = await request.json()
    const { message } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Message is required' },
        { status: 400 }
      )
    }

    // Get agent from registry
    const agent = getAgent(agentId)
    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      )
    }

    // Get session name - use agent name (new schema)
    const sessionName = agent.name || agent.alias
    if (!sessionName) {
      return NextResponse.json(
        { success: false, error: 'Agent has no session name' },
        { status: 400 }
      )
    }

    // Check if session exists and is online
    const hasOnlineSession = agent.sessions?.some(s => s.status === 'online')
    if (!hasOnlineSession) {
      return NextResponse.json(
        { success: false, error: 'Agent session is not online' },
        { status: 400 }
      )
    }

    // Escape the message for shell
    // Replace single quotes with escaped version for shell safety
    const escapedMessage = message
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "'\\''")
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')

    // Send message to tmux session
    // Using send-keys with the message followed by Enter
    // Note: Use -l (literal) to avoid interpreting special characters
    const tmuxCommand = `tmux send-keys -t '${sessionName}' -l '${escapedMessage}'`
    const enterCommand = `tmux send-keys -t '${sessionName}' Enter`

    console.log('[Chat API] Session:', sessionName)
    console.log('[Chat API] Message:', message)
    console.log('[Chat API] Escaped:', escapedMessage)
    console.log('[Chat API] Command:', tmuxCommand)

    // Send the text first, then Enter separately
    await execAsync(tmuxCommand)
    await execAsync(enterCommand)

    console.log('[Chat API] Message sent successfully')

    return NextResponse.json({
      success: true,
      message: 'Message sent to session',
      sessionName
    })
  } catch (error) {
    console.error('[Chat API] POST Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
