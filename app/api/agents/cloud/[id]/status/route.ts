/**
 * Cloud Agent Status API
 *
 * GET /api/agents/cloud/:id/status — Get cloud infrastructure status for an agent
 *
 * Thin wrapper — business logic in services/agents-cloud-service.ts
 */

import { NextResponse } from 'next/server'
import { getCloudAgentStatus } from '@/services/agents-cloud-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const result = await getCloudAgentStatus(id)
    return toResponse(result)
  } catch (error) {
    console.error('[Cloud Status] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get cloud agent status' },
      { status: 500 }
    )
  }
}
