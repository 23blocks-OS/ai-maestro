import { listAgents, listAgentsWithPeers, searchAgentsByQuery, createNewAgent } from '@/services/agents-core-service'
import { toResponse } from '@/app/api/_helpers'
import type { CreateAgentRequest } from '@/types/agent'

// Force this route to be dynamic (not statically generated at build time)
export const dynamic = 'force-dynamic'

/**
 * GET /api/agents
 * Returns all agents registered on THIS host with their live session status.
 *
 * Query params:
 *   - q: Search query (searches name, label, taskDescription, tags)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')

  // If search query provided, return simple search results
  if (query) {
    const result = searchAgentsByQuery(query)
    return toResponse(result)
  }

  // ?mesh=1: also every peer's agents, from /mesh (hooks/useAgents.ts)
  const result = searchParams.get('mesh') === '1' ? await listAgentsWithPeers() : await listAgents()
  return toResponse(result)
}

/**
 * POST /api/agents
 * Create a new agent
 */
export async function POST(request: Request) {
  const body: CreateAgentRequest = await request.json()
  const result = createNewAgent(body)
  return toResponse(result)
}
