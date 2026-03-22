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
import { isValidUuid } from '@/lib/validation'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: agentId } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const searchParams = request.nextUrl.searchParams
    const since = searchParams.get('since')
    // CC-P3-004: NaN guard — fall back to 100 if parseInt yields NaN
    const limit = parseInt(searchParams.get('limit') || '100', 10) || 100

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
  { params }: { params: { id: string } }
) {
  try {
    const { id: agentId } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    // CC-P2-005: Guard against malformed JSON body
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    }

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
