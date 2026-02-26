import { NextRequest, NextResponse } from 'next/server'
import { getConversationMessages } from '@/services/config-service'

// Force dynamic rendering -- reads runtime database state
export const dynamic = 'force-dynamic'

/**
 * GET /api/conversations/:file/messages?agentId=X
 * Get messages for a conversation from the RAG database (fast, cached).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  try {
    const { file: encodedFile } = await params

    // Decode once at the route boundary -- pass decoded value downstream
    // to prevent double-decode path traversal (MF-002)
    const decodedFile = decodeURIComponent(encodedFile)
    if (decodedFile.includes('../') || decodedFile.includes('..\\')) {
      return NextResponse.json(
        { success: false, error: 'Path traversal not allowed' },
        { status: 400 }
      )
    }

    const agentId = request.nextUrl.searchParams.get('agentId') || ''

    // Pass already-decoded file to prevent double-decode vulnerability
    const result = await getConversationMessages(decodedFile, agentId)

    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error, ...(result.data || {}) },
        { status: result.status }
      )
    }

    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    // URIError from malformed percent-encoded sequences, or other unexpected errors
    console.error('[ConversationMessages] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
