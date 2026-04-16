import { NextRequest } from 'next/server'
import { getConversationMessages } from '@/services/config-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/conversations/:file/messages?agentId=X
 * Get messages for a conversation from the RAG database (fast, cached).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file: encodedFile } = await params
  const agentId = request.nextUrl.searchParams.get('agentId') || ''

  const result = await getConversationMessages(encodedFile, agentId)
  return toResponse(result)
}
