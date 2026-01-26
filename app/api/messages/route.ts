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
  listAgentsWithMessages,
  resolveAgentIdentifier,
} from '@/lib/messageQueue'
import { searchAgents } from '@/lib/agent-registry'
import { getSelfHostId, getSelfHost } from '@/lib/hosts-config-server.mjs'
import { notifyAgent } from '@/lib/notification-service'

/**
 * GET /api/messages?agent=<agentId|alias|sessionName>&status=<status>&from=<from>&box=<inbox|sent>
 * List messages for an agent
 *
 * The 'agent' parameter accepts: Agent ID (UUID), alias, or session name
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const agentIdentifier = searchParams.get('agent')
  const messageId = searchParams.get('id')
  const action = searchParams.get('action')
  const box = searchParams.get('box') || 'inbox' // 'inbox' or 'sent'

  // Resolve agent info (exact match)
  if (action === 'resolve' && agentIdentifier) {
    const resolved = resolveAgentIdentifier(agentIdentifier)
    if (!resolved) {
      return NextResponse.json({ error: 'Agent not found', resolved: null }, { status: 404 })
    }
    return NextResponse.json({ resolved })
  }

  // Search agents (partial/fuzzy match)
  // Returns all agents whose name, alias, or label contains the query string
  if (action === 'search' && agentIdentifier) {
    const matches = searchAgents(agentIdentifier)
    const selfHostId = getSelfHostId()
    const selfHost = getSelfHost()

    // Map to simplified format for CLI
    const results = matches.map(agent => ({
      agentId: agent.id,
      alias: agent.alias || agent.name,
      name: agent.name,
      label: agent.label,
      displayName: agent.label || agent.alias || agent.name,
      hostId: selfHostId,
      hostUrl: selfHost?.url || `http://localhost:23000`,
    }))

    return NextResponse.json({
      query: agentIdentifier,
      count: results.length,
      results
    })
  }

  // Get specific message
  if (agentIdentifier && messageId) {
    const message = await getMessage(agentIdentifier, messageId, box as 'inbox' | 'sent')
    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }
    return NextResponse.json(message)
  }

  // Get unread count (inbox only)
  if (action === 'unread-count' && agentIdentifier) {
    const count = await getUnreadCount(agentIdentifier)
    return NextResponse.json({ count })
  }

  // Get sent count
  if (action === 'sent-count' && agentIdentifier) {
    const count = await getSentCount(agentIdentifier)
    return NextResponse.json({ count })
  }

  // Get message stats
  if (action === 'stats' && agentIdentifier) {
    const stats = await getMessageStats(agentIdentifier)
    return NextResponse.json(stats)
  }

  // List all agents with messages
  if (action === 'agents' || action === 'sessions') {
    const agents = await listAgentsWithMessages()
    return NextResponse.json({ agents, sessions: agents }) // Both for compatibility
  }

  // List messages for an agent
  if (!agentIdentifier) {
    return NextResponse.json({ error: 'Agent identifier required (agent ID, alias, or session name)' }, { status: 400 })
  }

  // List sent messages
  if (box === 'sent') {
    const priority = searchParams.get('priority') as 'low' | 'normal' | 'high' | 'urgent' | undefined
    const to = searchParams.get('to') || undefined

    const messages = await listSentMessages(agentIdentifier, { priority, to })
    return NextResponse.json({ messages })
  }

  // List inbox messages (default)
  const status = searchParams.get('status') as 'unread' | 'read' | 'archived' | undefined
  const priority = searchParams.get('priority') as 'low' | 'normal' | 'high' | 'urgent' | undefined
  const from = searchParams.get('from') || undefined

  const messages = await listInboxMessages(agentIdentifier, { status, priority, from })
  return NextResponse.json({ messages })
}

/**
 * POST /api/messages
 * Send a new message
 *
 * Body:
 * - from: Agent ID, alias, or session name
 * - to: Agent ID, alias, or session name
 * - subject: Message subject
 * - content: { type, message, context? }
 * - priority?: 'low' | 'normal' | 'high' | 'urgent'
 * - inReplyTo?: Message ID being replied to
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { from, to, subject, content, priority, inReplyTo, fromHost, toHost, fromAlias, toAlias, fromLabel, toLabel, fromVerified } = body

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

    const message = await sendMessage(from, to, subject, content, {
      priority,
      inReplyTo,
      fromHost,
      toHost,
      fromAlias,
      toAlias,
      fromLabel,
      toLabel,
      fromVerified,
    })

    // Notify target agent immediately (fire-and-forget, doesn't block response)
    const notificationResult = await notifyAgent({
      agentId: message.to,
      agentName: message.toAlias || message.to,
      agentHost: message.toHost || 'local',
      fromName: message.fromAlias || message.from,
      fromHost: message.fromHost,
      subject: message.subject,
      messageId: message.id,
      priority: message.priority,
      messageType: content.type,
    })

    return NextResponse.json({
      message,
      notified: notificationResult.notified,
    }, { status: 201 })
  } catch (error) {
    console.error('Error sending message:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to send message'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

/**
 * PATCH /api/messages?agent=<agentId|alias|sessionName>&id=<messageId>&action=<action>
 * Update message status (mark as read, archive, etc.)
 */
export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const agentIdentifier = searchParams.get('agent')
  const messageId = searchParams.get('id')
  const action = searchParams.get('action')

  if (!agentIdentifier || !messageId) {
    return NextResponse.json(
      { error: 'Agent identifier and message ID required' },
      { status: 400 }
    )
  }

  try {
    let success = false

    switch (action) {
      case 'read':
        success = await markMessageAsRead(agentIdentifier, messageId)
        break
      case 'archive':
        success = await archiveMessage(agentIdentifier, messageId)
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
 * DELETE /api/messages?agent=<agentId|alias|sessionName>&id=<messageId>
 * Delete a message
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const agentIdentifier = searchParams.get('agent')
  const messageId = searchParams.get('id')

  if (!agentIdentifier || !messageId) {
    return NextResponse.json(
      { error: 'Agent identifier and message ID required' },
      { status: 400 }
    )
  }

  try {
    const success = await deleteMessage(agentIdentifier, messageId)

    if (!success) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting message:', error)
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 })
  }
}
