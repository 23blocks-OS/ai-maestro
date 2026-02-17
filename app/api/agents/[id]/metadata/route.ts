import { NextRequest, NextResponse } from 'next/server'
import { getAgent, updateAgent } from '@/lib/agent-registry'

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
    const metadata = await request.json()

    const agent = updateAgent(agentId, { metadata })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({ metadata: agent.metadata })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update metadata'
    console.error('Failed to update agent metadata:', error)
    return NextResponse.json({ error: message }, { status: 400 })
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
    const agent = updateAgent(agentId, { metadata: {} })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to clear agent metadata:', error)
    return NextResponse.json({ error: 'Failed to clear metadata' }, { status: 500 })
  }
}
