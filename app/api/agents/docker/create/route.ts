/**
 * Docker Agent Create API
 *
 * POST /api/agents/docker/create — Create agent in Docker container
 *
 * Thin wrapper — business logic in services/agents-docker-service.ts
 */

import { NextResponse } from 'next/server'
import { createDockerAgent } from '@/services/agents-docker-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await createDockerAgent(body)
    return toResponse(result)
  } catch (error) {
    console.error('[Docker Create] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create Docker agent' },
      { status: 500 }
    )
  }
}
