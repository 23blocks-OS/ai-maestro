/**
 * Docker Agent Create API
 *
 * POST /api/agents/docker/create — Create agent in Docker container
 *
 * Thin wrapper — business logic in services/agents-docker-service.ts
 */

import { NextResponse } from 'next/server'
import { createDockerAgent } from '@/services/agents-docker-service'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await createDockerAgent(body)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Docker Create] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create Docker agent' },
      { status: 500 }
    )
  }
}
