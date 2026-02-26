import { NextRequest, NextResponse } from 'next/server'
import { broadcastActivityUpdate } from '@/services/sessions-service'

// Disable caching
export const dynamic = 'force-dynamic'

/**
 * POST /api/sessions/activity/update
 * Called by Claude Code hook to broadcast status updates in real-time
 */
export async function POST(request: NextRequest) {
  try {
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { sessionName, status, hookStatus, notificationType } = body

    // Validate sessionName format: only alphanumeric, hyphens, and underscores allowed
    // (tmux session names are restricted to this charset)
    if (sessionName && (typeof sessionName !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(sessionName))) {
      return NextResponse.json(
        { success: false, error: 'Invalid sessionName format — only alphanumeric, hyphens, and underscores allowed' },
        { status: 400 }
      )
    }

    // Validate status is one of the known activity statuses
    const VALID_STATUSES = ['active', 'idle', 'busy', 'offline', 'error', 'waiting', 'stopped']
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status '${status}'. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const result = broadcastActivityUpdate(sessionName, status, hookStatus, notificationType)

    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      )
    }

    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('[Activity Update API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
