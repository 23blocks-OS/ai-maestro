import { NextResponse } from 'next/server'
import { linkSession, unlinkSession } from '@/lib/agent-registry'

/**
 * POST /api/agents/[id]/session
 * Link a tmux session to an agent
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { sessionName, workingDirectory } = body

    if (!sessionName) {
      return NextResponse.json(
        { error: 'sessionName is required' },
        { status: 400 }
      )
    }

    const success = linkSession(
      params.id,
      sessionName,
      workingDirectory || process.cwd()
    )

    if (!success) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to link session'
    console.error('Failed to link session:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/**
 * DELETE /api/agents/[id]/session
 * Unlink session from agent
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const success = unlinkSession(params.id)

    if (!success) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to unlink session:', error)
    return NextResponse.json(
      { error: 'Failed to unlink session' },
      { status: 500 }
    )
  }
}
