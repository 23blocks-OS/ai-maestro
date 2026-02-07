import { NextResponse } from 'next/server'
import {
  getAgentMessage,
  markAgentMessageAsRead,
  archiveAgentMessage,
  deleteAgentMessage,
} from '@/lib/agent-messaging'
import { forwardFromUI } from '@/lib/message-send'

/**
 * GET /api/agents/[id]/messages/[messageId]
 * Get a specific message for an agent
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string; messageId: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const box = (searchParams.get('box') || 'inbox') as 'inbox' | 'sent'

    const message = await getAgentMessage(params.id, params.messageId, box)

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    return NextResponse.json({ message })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get message'
    console.error('Failed to get message:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/agents/[id]/messages/[messageId]
 * Update message status (mark as read, archive)
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; messageId: string } }
) {
  try {
    const { action } = await request.json()

    if (action === 'read') {
      const success = await markAgentMessageAsRead(params.id, params.messageId)
      if (!success) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    } else if (action === 'archive') {
      const success = await archiveAgentMessage(params.id, params.messageId)
      if (!success) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update message'
    console.error('Failed to update message:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/agents/[id]/messages/[messageId]
 * Delete a message
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; messageId: string } }
) {
  try {
    const success = await deleteAgentMessage(params.id, params.messageId)

    if (!success) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete message'
    console.error('Failed to delete message:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/agents/[id]/messages/[messageId]/forward
 * Forward a message to another agent
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string; messageId: string } }
) {
  try {
    const { to, note } = await request.json()

    if (!to) {
      return NextResponse.json({ error: 'Missing required field: to' }, { status: 400 })
    }

    const result = await forwardFromUI({
      originalMessageId: params.messageId,
      fromAgent: params.id,
      toAgent: to,
      forwardNote: note,
    })

    return NextResponse.json({ message: result.message }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to forward message'
    console.error('Failed to forward message:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
