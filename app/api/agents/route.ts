import { NextResponse } from 'next/server'
import { listAgents, createAgent, searchAgents } from '@/lib/agent-registry'
import type { CreateAgentRequest } from '@/types/agent'

/**
 * GET /api/agents
 * List all agents or search by query
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (query) {
      const agents = searchAgents(query)
      return NextResponse.json({ agents })
    }

    const agents = listAgents()
    return NextResponse.json({ agents })
  } catch (error) {
    console.error('Failed to list agents:', error)
    return NextResponse.json({ error: 'Failed to list agents' }, { status: 500 })
  }
}

/**
 * POST /api/agents
 * Create a new agent
 */
export async function POST(request: Request) {
  try {
    const body: CreateAgentRequest = await request.json()

    const agent = createAgent(body)
    return NextResponse.json({ agent }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create agent'
    console.error('Failed to create agent:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
