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
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    // CC-P2-009: Check for search errors before returning results
    if (query) {
      const result = searchAgentsByQuery(query)
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }
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
  } catch (error) {
    // CC-P3-001: Catch unexpected errors (e.g. URL parsing, service throws)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/agents
 * Create a new agent
 */
export async function POST(request: Request) {
  try {
    let body: CreateAgentRequest
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    // CC-P3-002: Wrap service call in try-catch for unexpected throws
    const result = createNewAgent(body)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
