/**
 * Agent Chat API
 *
 * GET  /api/agents/:id/chat — Get conversation messages
 * POST /api/agents/:id/chat — Send message to agent's tmux session
 *
 * Thin wrapper — business logic in services/agents-chat-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { getConversationMessages, sendChatMessage } from '@/services/agents-chat-service'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const searchParams = request.nextUrl.searchParams
    const since = searchParams.get('since')
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    const result = await getConversationMessages(agentId, { since, limit })
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Chat API] GET Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const body = await request.json()

    const result = await sendChatMessage(agentId, body.message)
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Chat API] POST Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
