import { NextRequest, NextResponse } from 'next/server'
import { parseConversationFile } from '@/services/config-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * POST /api/conversations/parse
 * Parse a JSONL conversation file and return messages with metadata.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversationFile } = body

    console.log('[Parse Conversation] Request for file:', conversationFile)

    const result = parseConversationFile(conversationFile)
    return toResponse(result)
  } catch (error) {
    console.error('[Parse Conversation] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
