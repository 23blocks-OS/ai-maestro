import { NextRequest } from 'next/server'
import {
  getMessage,
  updateMessage,
  deleteMessageById,
  forwardMessage,
} from '@/services/agents-messaging-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/agents/[id]/messages/[messageId]
 * Get a specific message for an agent
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const { id, messageId } = await params
  const { searchParams } = new URL(request.url)
  const box = (searchParams.get('box') || 'inbox') as 'inbox' | 'sent'

  const result = await getMessage(id, messageId, box)
  return toResponse(result)
}

/**
 * PATCH /api/agents/[id]/messages/[messageId]
 * Update message status (mark as read, archive)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const { id, messageId } = await params
  const body = await request.json()

  const result = await updateMessage(id, messageId, body)
  return toResponse(result)
}

/**
 * DELETE /api/agents/[id]/messages/[messageId]
 * Delete a message
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const { id, messageId } = await params

  const result = await deleteMessageById(id, messageId)
  return toResponse(result)
}

/**
 * POST /api/agents/[id]/messages/[messageId]
 * Forward a message to another agent
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const { id, messageId } = await params
  const body = await request.json()

  const result = await forwardMessage(id, messageId, body)
  return toResponse(result)
}
