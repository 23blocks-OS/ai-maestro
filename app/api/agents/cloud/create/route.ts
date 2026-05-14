/**
 * Cloud Agent Create API
 *
 * POST /api/agents/cloud/create — Create agent on AWS (EC2 or ECS Fargate)
 *
 * Thin wrapper — business logic in services/agents-cloud-service.ts
 */

import { NextResponse } from 'next/server'
import { createCloudAgent } from '@/services/agents-cloud-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await createCloudAgent(body)
    return toResponse(result)
  } catch (error) {
    console.error('[Cloud Create] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create cloud agent' },
      { status: 500 }
    )
  }
}
