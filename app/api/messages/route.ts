import { NextRequest, NextResponse } from 'next/server'
import { getMessages, sendMessage, updateMessage, removeMessage } from '@/services/messages-service'
import { authenticateAgent } from '@/lib/agent-auth'

/**
 * GET /api/messages?agent=<agentId|alias|sessionName>&status=<status>&from=<from>&box=<inbox|sent>
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const result = await getMessages({
    agent: searchParams.get('agent'),
    id: searchParams.get('id'),
    action: searchParams.get('action'),
    box: searchParams.get('box') || 'inbox',
    limit: searchParams.get('limit'),
    status: searchParams.get('status'),
    priority: searchParams.get('priority'),
    from: searchParams.get('from'),
    to: searchParams.get('to'),
  })
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
}

/**
 * POST /api/messages - Send a new message
 *
 * Authentication: If an agent provides Authorization + X-Agent-Id headers,
 * the sender identity is verified via API key and body.from is overridden
 * with the authenticated agent ID (prevents sender spoofing).
 * If no auth headers are present, the request is treated as coming from
 * the system owner / web UI, and body.from is used as-is.
 */
export async function POST(request: NextRequest) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Authenticate sender identity when auth headers are present
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  }
  // If authenticated agent, override body.from with verified identity
  // and mark the message as from a verified sender
  if (auth.agentId) {
    body.from = auth.agentId
    body.fromVerified = true
  }

  const result = await sendMessage(body)
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
}

/**
 * PATCH /api/messages?agent=<id>&id=<messageId>&action=<action>
 */
export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const result = await updateMessage(
    searchParams.get('agent'),
    searchParams.get('id'),
    searchParams.get('action'),
  )
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
}

/**
 * DELETE /api/messages?agent=<id>&id=<messageId>
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const result = await removeMessage(
    searchParams.get('agent'),
    searchParams.get('id'),
  )
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
}
