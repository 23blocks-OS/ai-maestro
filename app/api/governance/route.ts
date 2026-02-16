import { NextResponse } from 'next/server'
import { loadGovernance } from '@/lib/governance'
import { getAgent } from '@/lib/agent-registry'

export async function GET() {
  // Phase 1: localhost-only. managerId exposed intentionally for UI role display. TODO: restrict for Phase 2 remote access
  const config = loadGovernance()
  const managerName = config.managerId ? getAgent(config.managerId)?.name || null : null
  return NextResponse.json({
    hasPassword: !!config.passwordHash,
    hasManager: !!config.managerId,
    managerId: config.managerId,
    managerName,
  })
}
