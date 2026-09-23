import { NextRequest } from 'next/server'
import { getMemoryEntity } from '@/services/agents-memory-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agents/:id/memory/entity?name=<entity>
 * What the agent knows about one entity (name or alias, case-insensitive):
 * its relations and the memory cards that mention it.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  return toResponse(await getMemoryEntity(agentId, request.nextUrl.searchParams.get('name')))
}
