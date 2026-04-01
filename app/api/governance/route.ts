import { NextResponse } from 'next/server'
import { loadGovernance } from '@/lib/governance'
import { getAgent } from '@/lib/agent-registry'

export const dynamic = 'force-dynamic'

// Phase 1: No auth required for governance state read (localhost-only).
// Phase 2 TODO (SF-058): Require session token. Consider redacting managerId to truncated form.
// SF-029: Wrapped in try/catch to prevent unhandled errors from leaking stack traces
export async function GET() {
  try {
    const config = loadGovernance()
    // SF-054: Use nullish coalescing to preserve empty-string names
    const managerName = config.managerId ? getAgent(config.managerId)?.name ?? null : null
    return NextResponse.json({
      hasPassword: !!config.passwordHash,
      hasManager: !!config.managerId,
      managerId: config.managerId,
      managerName,
      userName: config.userName ?? null,
    })
  } catch (error) {
    console.error('[governance] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
