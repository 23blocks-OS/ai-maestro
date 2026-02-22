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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = authenticateAgent(
      request.headers.get('Authorization'),
      request.headers.get('X-Agent-Id')
    )
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: 403 })
    }

    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const result = await deployConfigToAgent(id, body.configuration || body, auth.agentId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error deploying agent config:', error)
    return NextResponse.json(
      { error: 'Failed to deploy agent config', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
