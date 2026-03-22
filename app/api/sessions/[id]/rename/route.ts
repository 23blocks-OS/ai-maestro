import { NextResponse } from 'next/server'
import { renameSession } from '@/services/sessions-service'

export const dynamic = 'force-dynamic'

/**
 * @deprecated Use PATCH /api/agents/[id] to update agent alias instead.
 * This endpoint uses tmux session names directly, while the agent endpoint
 * uses agent IDs for proper multi-host support.
 * Removal target: v0.28.0
 */
// NT-011: warn-once guard to avoid flooding logs on every request
let _deprecationWarned = false
function logDeprecation() {
  if (_deprecationWarned) return
  _deprecationWarned = true
  console.warn('[DEPRECATED] PATCH /api/sessions/[id]/rename - Use PATCH /api/agents/[id] to update alias instead')
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  logDeprecation()
  try {
    let jsonBody
    try { jsonBody = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    // NT-003: Use standard two-line pattern instead of tuple destructuring
    const { id: oldName } = await params
    const { newName } = jsonBody

    // SF-021: Validate newName matches tmux session naming constraints
    if (!newName || typeof newName !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(newName)) {
      return NextResponse.json({ error: 'newName is required and must match ^[a-zA-Z0-9_-]+$' }, { status: 400 })
    }

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
