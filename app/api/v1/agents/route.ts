/**
 * AMP v1 Agent List
 *
 * GET /api/v1/agents — List agents in tenant
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/amp-auth'
import { getAMPRegisteredAgents } from '@/lib/agent-registry'
import type { AMPError } from '@/lib/types/amp'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return NextResponse.json({
      error: auth.error || 'unauthorized',
      message: auth.message || 'Authentication required'
    } as AMPError, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')

  // Get AMP-registered agents in the same tenant
  let agents = getAMPRegisteredAgents()

  // Filter to same tenant
  if (auth.tenantId) {
    agents = agents.filter(a =>
      (a.metadata?.amp?.tenant as string) === auth.tenantId
    )
  }

  // Apply search filter
  if (search) {
    const searchLower = search.toLowerCase()
    agents = agents.filter(a =>
      (a.name?.toLowerCase().includes(searchLower)) ||
      (a.alias?.toLowerCase().includes(searchLower)) ||
      (a.label?.toLowerCase().includes(searchLower)) ||
      ((a.metadata?.amp?.address as string)?.toLowerCase().includes(searchLower))
    )
  }

  const agentList = agents.map(a => ({
    address: (a.metadata?.amp?.address as string) || `${a.name}@unknown`,
    alias: a.alias || a.label,
    online: a.sessions?.some(s => s.status === 'online') || false,
  }))

  return NextResponse.json({
    agents: agentList,
    total: agentList.length,
  })
}
