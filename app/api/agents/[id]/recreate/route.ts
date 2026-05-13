/**
 * Atomic recreate endpoint for cloud agents.
 *
 * POST /api/agents/[id]/recreate — Re-provision the container behind an
 * existing cloud agent while preserving all persisted config (programArgs,
 * model, mounts, hooks, label, avatar, working directory, tags, etc.).
 *
 * Thin wrapper — business logic in services/agents-docker-service.ts.
 */

import { NextResponse } from 'next/server'
import { recreateDockerAgent } from '@/services/agents-docker-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const result = await recreateDockerAgent(id)
    return toResponse(result)
  } catch (error) {
    console.error('[Docker Recreate] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to recreate Docker agent' },
      { status: 500 }
    )
  }
}
