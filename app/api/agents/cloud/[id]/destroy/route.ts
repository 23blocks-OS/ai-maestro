/**
 * Cloud Agent Destroy API
 *
 * POST /api/agents/cloud/:id/destroy — Destroy cloud infrastructure for an agent
 *
 * Thin wrapper — business logic in services/agents-cloud-service.ts
 */

import { NextResponse } from 'next/server'
import { destroyCloudAgent } from '@/services/agents-cloud-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const result = await destroyCloudAgent(id)
    return toResponse(result)
  } catch (error) {
    console.error('[Cloud Destroy] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to destroy cloud agent' },
      { status: 500 }
    )
  }
}
