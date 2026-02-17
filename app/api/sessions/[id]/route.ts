import { NextResponse } from 'next/server'
import { deleteSession } from '@/services/sessions-service'

export const dynamic = 'force-dynamic'

/**
 * @deprecated Use /api/agents/[id]/session?kill=true&deleteAgent=true instead.
 * This endpoint uses tmux session names directly, while the agent endpoint
 * uses agent IDs for proper multi-host support.
 */
function logDeprecation() {
  console.warn('[DEPRECATED] DELETE /api/sessions/[id] - Use DELETE /api/agents/[id]/session?kill=true&deleteAgent=true instead')
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  logDeprecation()
  try {
    const { id: sessionName } = await params
    const result = await deleteSession(sessionName)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('Failed to delete session:', error)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}
