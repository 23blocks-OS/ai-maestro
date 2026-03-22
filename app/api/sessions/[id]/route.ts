import { NextResponse } from 'next/server'
import { deleteSession } from '@/services/sessions-service'

export const dynamic = 'force-dynamic'

/**
 * @deprecated Use /api/agents/[id]/session?kill=true&deleteAgent=true instead.
 * This endpoint uses tmux session names directly, while the agent endpoint
 * uses agent IDs for proper multi-host support.
 * Removal target: v0.28.0
 */
// NT-011: warn-once guard to avoid flooding logs on every request
let _deprecationWarned = false
function logDeprecation() {
  if (_deprecationWarned) return
  _deprecationWarned = true
  console.warn('[DEPRECATED] DELETE /api/sessions/[id] - Use DELETE /api/agents/[id]/session?kill=true&deleteAgent=true instead')
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  logDeprecation()
  try {
    const { id: sessionName } = params
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
