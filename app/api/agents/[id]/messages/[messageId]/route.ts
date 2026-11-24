import { NextRequest } from 'next/server'
import {
  getMessage,
  updateMessage,
  deleteMessageById,
  forwardMessage,
} from '@/services/agents-messaging-service'
import { toResponse } from '@/app/api/_helpers'
import { callerFromHeaders } from '@/lib/caller-identity'

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

  const result = await getMessage(id, messageId, box, callerFromHeaders(request.headers))
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

  const result = await updateMessage(id, messageId, body, callerFromHeaders(request.headers))
  return toResponse(result)
}

/**
 * DELETE /api/agents/[id]/messages/[messageId]
 * Delete a message
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const { id, messageId } = await params

  const result = await deleteMessageById(id, messageId, callerFromHeaders(request.headers))
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

  const result = await forwardMessage(id, messageId, body, callerFromHeaders(request.headers))
  return toResponse(result)
}
