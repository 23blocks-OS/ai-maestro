import { NextResponse } from 'next/server'
import { initializeStartup, getStartupInfo } from '@/services/agents-core-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agents/startup
 * Initialize all registered agents on server boot
 */
export async function POST() {
  try {
    const result = await initializeStartup()

    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-018: Outer try-catch for unhandled service throws
    console.error('[Startup POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/agents/startup
 * Get startup status (how many agents discovered vs initialized)
 */
export async function GET() {
  try {
    const result = getStartupInfo()

    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-018: Outer try-catch for unhandled service throws
    console.error('[Startup GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
