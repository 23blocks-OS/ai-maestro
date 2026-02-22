import { NextResponse } from 'next/server'
import { loadGovernance } from '@/lib/governance'
import { getAgent } from '@/lib/agent-registry'

export const dynamic = 'force-dynamic'

// Phase 1: Intentionally exposes managerId for localhost-only usage. TODO Phase 2: Add auth for remote access.
// SF-029: Wrapped in try/catch to prevent unhandled errors from leaking stack traces
export async function GET() {
  try {
    const config = loadGovernance()
    const managerName = config.managerId ? getAgent(config.managerId)?.name || null : null
    return NextResponse.json({
      hasPassword: !!config.passwordHash,
      hasManager: !!config.managerId,
      managerId: config.managerId,
      managerName,
    })
  } catch (error) {
    console.error('[governance] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
