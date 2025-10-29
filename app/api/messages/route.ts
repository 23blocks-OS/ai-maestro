import { NextRequest, NextResponse } from 'next/server'
import {
  sendMessage,
  listInboxMessages,
  listSentMessages,
  getSentCount,
  getMessage,
  markMessageAsRead,
  archiveMessage,
  deleteMessage,
  getUnreadCount,
  getMessageStats,
  listSessionsWithMessages,
} from '@/lib/messageQueue'

/**
 * GET /api/messages?session=<sessionName>&status=<status>&from=<from>&box=<inbox|sent>
 * List messages for a session
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionName = searchParams.get('session')
  const messageId = searchParams.get('id')
  const action = searchParams.get('action')
  const box = searchParams.get('box') || 'inbox' // 'inbox' or 'sent'

  // Get specific message
  if (sessionName && messageId) {
    const message = await getMessage(sessionName, messageId, box as 'inbox' | 'sent')
    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }
    return NextResponse.json(message)
  }

  // Get unread count (inbox only)
  if (action === 'unread-count' && sessionName) {
    const count = await getUnreadCount(sessionName)
    return NextResponse.json({ count })
  }

  // Get sent count
  if (action === 'sent-count' && sessionName) {
    const count = await getSentCount(sessionName)
    return NextResponse.json({ count })
  }

  // Get message stats
  if (action === 'stats' && sessionName) {
    const stats = await getMessageStats(sessionName)
    return NextResponse.json(stats)
  }

  // List all sessions with messages
  if (action === 'sessions') {
    const sessions = await listSessionsWithMessages()
    return NextResponse.json({ sessions })
  }

  // List messages for a session
  if (!sessionName) {
    return NextResponse.json({ error: 'Session name required' }, { status: 400 })
  }

  // List sent messages
  if (box === 'sent') {
    const priority = searchParams.get('priority') as 'low' | 'normal' | 'high' | 'urgent' | undefined
    const to = searchParams.get('to') || undefined

    const messages = await listSentMessages(sessionName, { priority, to })
    return NextResponse.json({ messages })
  }

  // List inbox messages (default)
  const status = searchParams.get('status') as 'unread' | 'read' | 'archived' | undefined
  const priority = searchParams.get('priority') as 'low' | 'normal' | 'high' | 'urgent' | undefined
  const from = searchParams.get('from') || undefined

  const messages = await listInboxMessages(sessionName, { status, priority, from })
  return NextResponse.json({ messages })
}

/**
 * POST /api/messages
 * Send a new message
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { from, to, subject, content, priority, inReplyTo } = body

    // Validate required fields
    if (!from || !to || !subject || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: from, to, subject, content' },
        { status: 400 }
      )
    }

    // Validate content structure
    if (!content.type || !content.message) {
      return NextResponse.json(
        { error: 'Content must have type and message fields' },
        { status: 400 }
      )
    }

    const message = await sendMessage(from, to, subject, content, { priority, inReplyTo })

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error('Error sending message:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}

/**
 * PATCH /api/messages?session=<sessionName>&id=<messageId>&action=<action>
 * Update message status (mark as read, archive, etc.)
 */
export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionName = searchParams.get('session')
  const messageId = searchParams.get('id')
  const action = searchParams.get('action')

  if (!sessionName || !messageId) {
    return NextResponse.json(
      { error: 'Session name and message ID required' },
      { status: 400 }
    )
  }

  try {
    let success = false

    switch (action) {
      case 'read':
        success = await markMessageAsRead(sessionName, messageId)
        break
      case 'archive':
        success = await archiveMessage(sessionName, messageId)
        break
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    if (!success) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating message:', error)
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 })
  }
}

/**
 * DELETE /api/messages?session=<sessionName>&id=<messageId>
 * Delete a message
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionName = searchParams.get('session')
  const messageId = searchParams.get('id')

  if (!sessionName || !messageId) {
    return NextResponse.json(
      { error: 'Session name and message ID required' },
      { status: 400 }
    )
  }

  try {
    const success = await deleteMessage(sessionName, messageId)

    if (!success) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting message:', error)
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 })
  }
}
