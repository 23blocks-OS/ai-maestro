import { NextRequest } from 'next/server'
import { getMessages, sendMessage, updateMessage, removeMessage } from '@/services/messages-service'
import { toResponse } from '@/app/api/_helpers'
import { callerFromHeaders } from '@/lib/caller-identity'

/**
 * GET /api/messages?agent=<agentId|alias|sessionName>&status=<status>&from=<from>&box=<inbox|sent>
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const result = await getMessages({
    agent: searchParams.get('agent'),
    id: searchParams.get('id'),
    action: searchParams.get('action'),
    box: searchParams.get('box') || 'inbox',
    limit: searchParams.get('limit'),
    status: searchParams.get('status'),
    priority: searchParams.get('priority'),
    from: searchParams.get('from'),
    to: searchParams.get('to'),
  }, callerFromHeaders(request.headers))
  return toResponse(result)
}

/**
 * POST /api/messages - Send a new message
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await sendMessage(body, callerFromHeaders(request.headers))
  return toResponse(result)
}

/**
 * PATCH /api/messages?agent=<id>&id=<messageId>&action=<action>
 */
export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const result = await updateMessage(
    searchParams.get('agent'),
    searchParams.get('id'),
    searchParams.get('action'),
    callerFromHeaders(request.headers),
  )
  return toResponse(result)
}

/**
 * DELETE /api/messages?agent=<id>&id=<messageId>
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const result = await removeMessage(
    searchParams.get('agent'),
    searchParams.get('id'),
    callerFromHeaders(request.headers),
  )
  return toResponse(result)
}
