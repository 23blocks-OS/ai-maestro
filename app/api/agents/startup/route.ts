import { NextResponse } from 'next/server'
import { initializeAllAgents, getStartupStatus } from '@/lib/agent-startup'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agents/startup
 * Initialize all registered agents on server boot
 * This is called by the server after it starts
 */
export async function POST() {
  try {
    console.log('[Startup API] Initializing all agents...')

    const result = await initializeAllAgents()

    console.log(`[Startup API] Complete: ${result.initialized.length} agents initialized`)

    return NextResponse.json({
      success: true,
      message: `Initialized ${result.initialized.length} agent(s)`,
      ...result
    })
  } catch (error) {
    console.error('[Startup API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/agents/startup
 * Get startup status (how many agents discovered vs initialized)
 */
export async function GET() {
  try {
    const status = getStartupStatus()

    return NextResponse.json({
      success: true,
      ...status
    })
  } catch (error) {
    console.error('[Startup API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
