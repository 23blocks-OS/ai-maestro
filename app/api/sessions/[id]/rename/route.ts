import { NextResponse } from 'next/server'
import { renameSession } from '@/services/sessions-service'

export const dynamic = 'force-dynamic'

/**
 * @deprecated Use PATCH /api/agents/[id] to update agent alias instead.
 * This endpoint uses tmux session names directly, while the agent endpoint
 * uses agent IDs for proper multi-host support.
 */
function logDeprecation() {
  console.warn('[DEPRECATED] PATCH /api/sessions/[id]/rename - Use PATCH /api/agents/[id] to update alias instead')
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  logDeprecation()
  try {
    const [{ newName }, { id: oldName }] = await Promise.all([
      request.json(),
      params
    ])

    const result = await renameSession(oldName, newName)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('Failed to rename session:', error)
    return NextResponse.json({ error: 'Failed to rename session' }, { status: 500 })
  }
}
