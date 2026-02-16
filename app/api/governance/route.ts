import { NextResponse } from 'next/server'
import { loadGovernance } from '@/lib/governance'
import { getAgent } from '@/lib/agent-registry'

export async function GET() {
  const config = loadGovernance()
  const managerName = config.managerId ? getAgent(config.managerId)?.name || null : null
  return NextResponse.json({
    hasPassword: !!config.passwordHash,
    hasManager: !!config.managerId,
    managerId: config.managerId,
    managerName,
  })
}
