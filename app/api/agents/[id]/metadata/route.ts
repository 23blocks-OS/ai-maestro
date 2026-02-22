import { NextRequest, NextResponse } from 'next/server'
import { getAgent, updateAgent } from '@/lib/agent-registry'
import { isValidUuid } from '@/lib/validation'

/**
 * GET /api/agents/[id]/metadata
 * Get agent metadata (custom key-value pairs)
 *
 * NOTE: No service function exists for metadata yet.
 * This route uses agent-registry directly until a service is created.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const agent = getAgent(agentId)

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({ metadata: agent.metadata || {} })
  } catch (error) {
    console.error('Failed to get agent metadata:', error)
    return NextResponse.json({ error: 'Failed to get agent metadata' }, { status: 500 })
  }
}

/**
 * PATCH /api/agents/[id]/metadata
 * Update agent metadata (merges with existing metadata)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    let metadata
    try { metadata = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const agent = await updateAgent(agentId, { metadata })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({ metadata: agent.metadata })
  } catch (error) {
    // SF-007: Differentiate validation errors (400) from internal errors (500)
    console.error('Failed to update agent metadata:', error)
    if (error instanceof TypeError || (error instanceof Error && error.message.includes('Invalid'))) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/agents/[id]/metadata
 * Clear all agent metadata
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const agent = await updateAgent(agentId, { metadata: {} })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to clear agent metadata:', error)
    return NextResponse.json({ error: 'Failed to clear metadata' }, { status: 500 })
  }
}
