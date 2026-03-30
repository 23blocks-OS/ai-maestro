/**
 * POST /api/governance/password - Set or change governance password
 *
 * SF-031 (P8): Delegates all business logic to governance-service.setGovernancePassword
 * to eliminate duplicate password logic between route and service layers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { setGovernancePassword } from '@/services/governance-service'

// NT-023 (P8): Ensure Next.js does not cache this route
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // SF-031 (P8): Single source of truth for password logic lives in governance-service
    const result = await setGovernancePassword({
      password: body.password,
      currentPassword: body.currentPassword,
      userName: body.userName,
    })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('[governance] password POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
