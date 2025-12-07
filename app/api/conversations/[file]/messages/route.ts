import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry } from '@/lib/agent'

/**
 * GET /api/conversations/:file/messages?agentId=X
 * Get messages for a conversation from the RAG database (fast, cached)
 *
 * This replaces the slow /api/conversations/parse endpoint that reads from disk
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  try {
    const { file: encodedFile } = await params
    const searchParams = request.nextUrl.searchParams
    const agentId = searchParams.get('agentId')

    if (!agentId) {
      return NextResponse.json(
        { error: 'agentId query parameter is required' },
        { status: 400 }
      )
    }

    // Decode the file path (it was URL encoded)
    const conversationFile = decodeURIComponent(encodedFile)

    // Get or create agent (will initialize with subconscious if first time)
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Query messages from RAG database
    const result = await agentDb.run(`
      ?[msg_id, conversation_file, role, ts, text] :=
        *messages{msg_id, conversation_file, role, ts, text},
        conversation_file = '${conversationFile.replace(/'/g, "''")}'

      :order ts
    `)

    // NOTE: Don't close agentDb - it's owned by the agent and stays open

    // Check if we have indexed messages
    if (!result.rows || result.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No messages found in RAG database. Conversation may not be indexed yet.',
        fallback_to_parse: true,
        conversation_file: conversationFile
      }, { status: 404 })
    }

    // Transform to expected format
    const messages = result.rows.map((row: any[]) => ({
      msg_id: row[0],
      conversation_file: row[1],
      type: row[2], // role -> type for compatibility
      timestamp: new Date(row[3]).toISOString(),
      message: {
        content: row[4] // text
      }
    }))

    return NextResponse.json({
      success: true,
      messages,
      metadata: {
        totalMessages: messages.length,
        source: 'rag_database',
        conversationFile
      }
    })
  } catch (error) {
    console.error('[Messages API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
