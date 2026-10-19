/**
 * POST /api/agents/:id/skills/install — install plugins (plugin@marketplace) for an agent
 *
 * Thin wrapper — business logic in services/agents-skills-service.ts
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { installAgentPlugins } from '@/services/agents-skills-service'
import { toResponse } from '@/app/api/_helpers'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    return toResponse(await installAgentPlugins(id, body))
  } catch (error) {
    console.error('Error installing plugins:', error)
    return NextResponse.json(
      { error: 'Failed to install plugins', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
