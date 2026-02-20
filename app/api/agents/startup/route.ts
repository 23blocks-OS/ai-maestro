import { NextResponse } from 'next/server'
import { initializeStartup, getStartupInfo } from '@/services/agents-core-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agents/startup
 * Initialize all registered agents on server boot
 */
export async function POST() {
  const result = await initializeStartup()

  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data)
}

/**
 * GET /api/agents/startup
 * Get startup status (how many agents discovered vs initialized)
 */
export async function GET() {
  const result = getStartupInfo()

  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data)
}
