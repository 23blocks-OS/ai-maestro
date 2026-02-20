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
    const { sessionName, status, hookStatus, notificationType } = await request.json()

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
