import { NextRequest, NextResponse } from 'next/server'
import { heartbeat } from '@/services/sessions-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agents/:id/heartbeat
 * Standalone agents call this periodically to appear in the dashboard.
 * Body: { status?: 'active' | 'idle' | 'waiting' }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const result = heartbeat(id, body.status)
    return toResponse(result)
  } catch (error) {
    console.error('[Heartbeat API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
