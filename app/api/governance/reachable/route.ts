import { NextRequest, NextResponse } from 'next/server'
import { getReachableAgents } from '@/services/governance-service'

// SF-033: Delegate entirely to governance-service.ts to eliminate duplicate cache.
// The service layer maintains its own bounded cache with TTL eviction.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const agentId = request.nextUrl.searchParams.get('agentId')
    const result = getReachableAgents(agentId)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error computing reachable agents:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
