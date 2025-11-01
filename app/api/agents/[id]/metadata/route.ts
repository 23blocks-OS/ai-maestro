import { NextResponse } from 'next/server'
import { getAgent, updateAgent } from '@/lib/agent-registry'

/**
 * GET /api/agents/[id]/metadata
 * Get agent metadata (custom key-value pairs)
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const agent = getAgent(params.id)

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
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const metadata = await request.json()

    const agent = updateAgent(params.id, { metadata })

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
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const agent = updateAgent(params.id, { metadata: {} })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to clear agent metadata:', error)
    return NextResponse.json({ error: 'Failed to clear metadata' }, { status: 500 })
  }
}
