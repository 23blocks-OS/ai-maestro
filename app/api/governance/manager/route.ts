import { NextRequest, NextResponse } from 'next/server'
import { setManagerRole } from '@/services/governance-service'

// NT-023 (P8): Ensure Next.js does not cache this route
export const dynamic = 'force-dynamic'

// SF-001: Delegate to governance-service.setManagerRole() instead of duplicating
// lib/governance + lib/rate-limit logic. The service handles password verification,
// rate limiting, agent lookup, role-plugin auto-assignment, and manager set/remove.
export async function POST(request: NextRequest) {
  try {
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const result = await setManagerRole({ agentId: body.agentId, password: body.password })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status || 500 })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[governance] manager POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set manager' },
      { status: 500 }
    )
  }
}
