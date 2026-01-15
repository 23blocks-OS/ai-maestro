import { NextRequest, NextResponse } from 'next/server'

// Disable caching
export const dynamic = 'force-dynamic'

declare global {
  var broadcastStatusUpdate: ((sessionName: string, status: string, hookStatus?: string, notificationType?: string) => void) | undefined
}

/**
 * POST /api/sessions/activity/update
 * Called by Claude Code hook to broadcast status updates in real-time
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionName, status, hookStatus, notificationType } = body

    if (!sessionName) {
      return NextResponse.json(
        { success: false, error: 'sessionName is required' },
        { status: 400 }
      )
    }

    // Broadcast to all WebSocket subscribers
    if (global.broadcastStatusUpdate) {
      global.broadcastStatusUpdate(sessionName, status, hookStatus, notificationType)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Activity Update API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
