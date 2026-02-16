import { NextRequest, NextResponse } from 'next/server'
import {
  getAgentSessionStatus,
  linkAgentSession,
  sendAgentSessionCommand,
  unlinkOrDeleteAgentSession,
} from '@/services/agents-core-service'

/**
 * POST /api/agents/[id]/session
 * Link a tmux session to an agent
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const result = linkAgentSession(id, body)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * PATCH /api/agents/[id]/session
 * Send a command to the agent's tmux session
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  const result = await sendAgentSessionCommand(id, {
    command: body.command,
    requireIdle: body.requireIdle,
    addNewline: body.addNewline,
  })

  if (result.error && result.status !== 409) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    )
  }

  // For 409 (not idle), include data + error together
  if (result.status === 409) {
    return NextResponse.json(
      { success: false, error: result.error, ...result.data },
      { status: 409 }
    )
  }

  return NextResponse.json(result.data)
}

/**
 * GET /api/agents/[id]/session
 * Get session status for an agent
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await getAgentSessionStatus(id)

  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data)
}

/**
 * DELETE /api/agents/[id]/session
 * Unlink session from agent, optionally kill the tmux session
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const searchParams = request.nextUrl.searchParams

  const result = await unlinkOrDeleteAgentSession(id, {
    kill: searchParams.get('kill') === 'true',
    deleteAgent: searchParams.get('deleteAgent') === 'true',
  })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
