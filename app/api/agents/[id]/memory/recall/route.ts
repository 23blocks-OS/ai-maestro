import { NextRequest } from 'next/server'
import { recallMemories } from '@/services/agents-memory-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agents/:id/memory/recall
 *
 * Query parameters:
 * - q: what the agent is about to work on; omit for the session-start primer
 * - limit: max memories (default 5, max 20)
 * - maxDistance: cosine distance cutoff (default 0.32)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const sp = request.nextUrl.searchParams
  const maxDistance = sp.get('maxDistance')
  return toResponse(await recallMemories(agentId, {
    query: sp.get('q'),
    limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
    maxDistance: maxDistance ? Number(maxDistance) : undefined,
  }))
}
