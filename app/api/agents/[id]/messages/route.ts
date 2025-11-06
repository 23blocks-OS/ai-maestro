import { NextResponse } from 'next/server'
import {
  listAgentInboxMessages,
  listAgentSentMessages,
  sendAgentMessage,
  getAgentMessageStats
} from '@/lib/agent-messaging'

/**
 * GET /api/agents/[id]/messages
 * List messages for an agent (inbox or sent)
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const box = searchParams.get('box') || 'inbox'
    const status = searchParams.get('status') as any
    const priority = searchParams.get('priority') as any
    const from = searchParams.get('from') || undefined
    const to = searchParams.get('to') || undefined

    if (box === 'sent') {
      const messages = await listAgentSentMessages(params.id, {
        priority,
        to
      })
      return NextResponse.json({ messages })
    } else if (box === 'stats') {
      const stats = await getAgentMessageStats(params.id)
      return NextResponse.json({ stats })
    } else {
      const messages = await listAgentInboxMessages(params.id, {
        status,
        priority,
        from
      })
      return NextResponse.json({ messages })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list messages'
    console.error('Failed to list messages:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/agents/[id]/messages
 * Send a message from this agent to another agent
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { to, subject, content, priority, inReplyTo } = await request.json()

    if (!to || !subject || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, content' },
        { status: 400 }
      )
    }

    const message = await sendAgentMessage(
      params.id,
      to,
      subject,
      content,
      { priority, inReplyTo }
    )

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send message'
    console.error('Failed to send message:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
