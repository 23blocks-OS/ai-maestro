import { NextRequest, NextResponse } from 'next/server'
import { getConversationMessages } from '@/services/config-service'

/**
 * GET /api/conversations/:file/messages?agentId=X
 * Get messages for a conversation from the RAG database (fast, cached).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file: encodedFile } = await params

  // SF-017: Reject path traversal attempts (../) in the file parameter
  const decodedFile = decodeURIComponent(encodedFile)
  if (decodedFile.includes('../') || decodedFile.includes('..\\')) {
    return NextResponse.json(
      { success: false, error: 'Path traversal not allowed' },
      { status: 400 }
    )
  }

  const agentId = request.nextUrl.searchParams.get('agentId') || ''

  const result = await getConversationMessages(encodedFile, agentId)

  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error, ...(result.data || {}) },
      { status: result.status }
    )
  }

  return NextResponse.json(result.data, { status: result.status })
}
