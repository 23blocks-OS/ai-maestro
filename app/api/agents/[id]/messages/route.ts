import { NextRequest } from 'next/server'
import { listMessages, sendMessage } from '@/services/agents-messaging-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/agents/[id]/messages
 * List messages for an agent (inbox, sent, or stats)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)

  const result = await listMessages(id, {
    box: searchParams.get('box') || undefined,
    status: searchParams.get('status') as any,
    priority: searchParams.get('priority') as any,
    from: searchParams.get('from') || undefined,
    to: searchParams.get('to') || undefined,
  })

  return toResponse(result)
}

/**
 * POST /api/agents/[id]/messages
 * Send a message from this agent to another agent
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  const result = await sendMessage(id, body)
  return toResponse(result)
}
