/**
 * Agent Config Deploy API
 *
 * POST /api/agents/:id/config/deploy — Deploy configuration to agent's .claude/ directory
 *
 * Requires agent authentication. Used by cross-host governance and local admin.
 * Business logic in services/agents-config-deploy-service.ts
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { deployConfigToAgent } from '@/services/agents-config-deploy-service'
import { isValidUuid } from '@/lib/validation'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const auth = authenticateAgent(
      request.headers.get('Authorization'),
      request.headers.get('X-Agent-Id')
    )
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
    }

    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // Accept configuration either as nested field or as direct body (for cross-host governance service compatibility)
    const config = body.configuration !== undefined ? body.configuration : body
    const result = await deployConfigToAgent(id, config, auth.agentId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error deploying agent config:', error)
    return NextResponse.json(
      { error: 'Failed to deploy agent config' },
      { status: 500 }
    )
  }
}
