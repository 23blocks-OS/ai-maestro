import { NextResponse } from 'next/server'
import { listAgents, searchAgentsByQuery, createNewAgent } from '@/services/agents-core-service'
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
    return NextResponse.json(result.data, { status: result.status })
  }

  const result = await listAgents()
  if (result.error) {
    return NextResponse.json(
      { error: result.error, agents: [] },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data)
}

/**
 * POST /api/agents
 * Create a new agent
 */
export async function POST(request: Request) {
  const body: CreateAgentRequest = await request.json()
  const result = createNewAgent(body)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
