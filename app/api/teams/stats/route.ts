import { NextResponse } from 'next/server'
import { getTeamsBulkStats } from '@/services/teams-service'

export const dynamic = 'force-dynamic'

// SF-028: Bulk stats endpoint to eliminate N+1 fetch pattern on teams page
// GET /api/teams/stats - Returns { [teamId]: { taskCount, docCount } }
export async function GET() {
  try {
    const result = getTeamsBulkStats()
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: 200 })
  } catch (error) {
    console.error('[teams/stats] Unhandled error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
