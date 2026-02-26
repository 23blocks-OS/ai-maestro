import { NextRequest, NextResponse } from 'next/server'
import { listMessages, sendMessage } from '@/services/agents-messaging-service'
import { isValidUuid } from '@/lib/validation'

/**
 * GET /api/agents/[id]/messages
 * List messages for an agent (inbox, sent, or stats)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    // SF-001 fix: Use NextRequest.nextUrl.searchParams instead of new URL(request.url)
    const searchParams = request.nextUrl.searchParams

    const result = await listMessages(id, {
      box: searchParams.get('box') || undefined,
      status: searchParams.get('status') || undefined,
      priority: searchParams.get('priority') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
    })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Messages GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/agents/[id]/messages
 * Send a message from this agent to another agent
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const result = await sendMessage(id, body)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('[Messages POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
