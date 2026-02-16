import { NextResponse } from 'next/server'
import { listRestorableSessions, restoreSessions, deletePersistedSession } from '@/services/sessions-service'

/**
 * GET /api/sessions/restore
 * Returns list of persisted sessions that can be restored
 */
export async function GET() {
  try {
    const result = await listRestorableSessions()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to load restorable sessions:', error)
    return NextResponse.json({ error: 'Failed to load restorable sessions' }, { status: 500 })
  }
}

/**
 * POST /api/sessions/restore
 * Restores one or all persisted sessions
 */
export async function POST(request: Request) {
  try {
    const { sessionId, all } = await request.json()

    const result = await restoreSessions({ sessionId, all })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ success: true, ...result.data }, { status: result.status })
  } catch (error) {
    console.error('Failed to restore sessions:', error)
    return NextResponse.json({ error: 'Failed to restore sessions' }, { status: 500 })
  }
}

/**
 * DELETE /api/sessions/restore?sessionId=<id>
 * Permanently deletes a persisted session from storage
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    const result = deletePersistedSession(sessionId || '')

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('Failed to delete persisted session:', error)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}
