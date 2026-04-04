import { NextResponse } from 'next/server'
import { listAgents, searchAgentsByQuery } from '@/services/agents-core-service'
import { CreateAgent } from '@/services/element-management-service'

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
    let body: Record<string, unknown>
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // Delegate to all-in-one CreateAgent pipeline
    const result = await CreateAgent({
      name: body.name as string,
      label: body.label as string | undefined,
      client: body.client as string | undefined,
      program: body.program as string | undefined,
      workingDirectory: body.workingDirectory as string | undefined,
      governanceTitle: body.governanceTitle as string | undefined,
      teamId: body.teamId as string | undefined,
      avatar: body.avatar as string | undefined,
      programArgs: body.programArgs as string | undefined,
      owner: body.owner as string | undefined,
      tags: body.tags as string[] | undefined,
      model: body.model as string | undefined,
      taskDescription: body.taskDescription as string | undefined,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Return the created agent (match old response format)
    const { getAgent } = await import('@/lib/agent-registry')
    const agent = result.agentId ? getAgent(result.agentId) : null
    return NextResponse.json({ agent }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
