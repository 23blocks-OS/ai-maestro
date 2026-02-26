import { NextRequest, NextResponse } from 'next/server'
import { parseConversationFile } from '@/services/config-service'

/**
 * POST /api/conversations/parse
 * Parse a JSONL conversation file and return messages with metadata.
 */
export async function POST(request: NextRequest) {
  try {
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { conversationFile } = body

    // SF-016: Validate conversationFile is a non-empty string before passing to service
    if (!conversationFile || typeof conversationFile !== 'string') {
      return NextResponse.json(
        { success: false, error: 'conversationFile must be a non-empty string' },
        { status: 400 }
      )
    }

    const result = parseConversationFile(conversationFile)

    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      )
    }

    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('[Parse Conversation] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
