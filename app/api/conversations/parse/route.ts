import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'

/**
 * POST /api/conversations/parse
 * Parse a JSONL conversation file and return messages with metadata
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversationFile } = body

    if (!conversationFile) {
      return NextResponse.json(
        { error: 'conversationFile is required' },
        { status: 400 }
      )
    }

    // Check if file exists
    if (!fs.existsSync(conversationFile)) {
      return NextResponse.json(
        { error: 'Conversation file not found' },
        { status: 404 }
      )
    }

    // Read the JSONL file
    const fileContent = fs.readFileSync(conversationFile, 'utf-8')
    const lines = fileContent.split('\n').filter(line => line.trim())

    // Parse all messages
    const messages = []
    const metadata: {
      sessionId?: string
      cwd?: string
      gitBranch?: string
      claudeVersion?: string
      model?: string
      firstMessageAt?: Date
      lastMessageAt?: Date
      totalMessages: number
      toolsUsed: Set<string>
    } = {
      totalMessages: 0,
      toolsUsed: new Set()
    }

    for (const line of lines) {
      try {
        const message = JSON.parse(line)

        // Detect skill expansion messages
        // These are user-typed messages that contain skill content
        if (message.type === 'user' && message.message?.content) {
          const content = typeof message.message.content === 'string'
            ? message.message.content
            : Array.isArray(message.message.content)
              ? message.message.content.find((b: any) => b.type === 'text')?.text || ''
              : ''

          // Check if this is a skill expansion message
          if (content.includes('Base directory for this skill:') ||
              content.includes('<skill>') ||
              content.match(/^#\s+\w+/m)) { // Starts with markdown header after skill expansion
            message.isSkill = true
            message.originalType = message.type
            message.type = 'skill'
          }
        }

        // Extract metadata from early messages
        if (!metadata.sessionId && message.sessionId) {
          metadata.sessionId = message.sessionId
        }
        if (!metadata.cwd && message.cwd) {
          metadata.cwd = message.cwd
        }
        if (!metadata.gitBranch && message.gitBranch) {
          metadata.gitBranch = message.gitBranch
        }
        if (!metadata.claudeVersion && message.version) {
          metadata.claudeVersion = message.version
        }
        if (!metadata.model && message.message?.model) {
          metadata.model = message.message.model
        }

        // Track timestamps
        if (message.timestamp) {
          const ts = new Date(message.timestamp)
          if (!metadata.firstMessageAt || ts < metadata.firstMessageAt) {
            metadata.firstMessageAt = ts
          }
          if (!metadata.lastMessageAt || ts > metadata.lastMessageAt) {
            metadata.lastMessageAt = ts
          }
        }

        // Track tool usage
        if (message.type === 'tool_use' && message.toolName) {
          metadata.toolsUsed.add(message.toolName)
        }

        // Add message to list
        messages.push(message)
        metadata.totalMessages++
      } catch (parseErr) {
        // Skip malformed lines
        console.error('[Parse Conversation] Failed to parse line:', parseErr)
      }
    }

    return NextResponse.json({
      success: true,
      messages,
      metadata: {
        ...metadata,
        toolsUsed: Array.from(metadata.toolsUsed)
      }
    })
  } catch (error) {
    console.error('[Parse Conversation] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
