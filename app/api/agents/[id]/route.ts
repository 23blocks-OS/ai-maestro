import { NextResponse } from 'next/server'
import { getAgent, updateAgent, deleteAgent } from '@/lib/agent-registry'
import type { UpdateAgentRequest } from '@/types/agent'

/**
 * GET /api/agents/[id]
 * Get a specific agent by ID
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

    return NextResponse.json({ agent })
  } catch (error) {
    console.error('Failed to get agent:', error)
    return NextResponse.json({ error: 'Failed to get agent' }, { status: 500 })
  }
}

/**
 * PATCH /api/agents/[id]
 * Update an agent
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Check if agent exists and is not soft-deleted before allowing update
    const existing = getAgent(params.id, true) // include deleted to distinguish 404 vs 410
    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    if (existing.deletedAt) {
      return NextResponse.json({ error: 'Cannot update a deleted agent' }, { status: 410 })
    }

    const body: UpdateAgentRequest = await request.json()

    const agent = updateAgent(params.id, body)

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({ agent })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update agent'
    console.error('Failed to update agent:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/**
 * DELETE /api/agents/[id]
 * Delete an agent. Soft-delete by default (preserves data, marks as deleted).
 * Pass ?hard=true for permanent deletion (creates backup first).
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Parse ?hard= query parameter for permanent deletion (case-insensitive)
    const url = new URL(request.url)
    const hardParam = url.searchParams.get('hard')?.toLowerCase()
    const hard = hardParam === 'true' || hardParam === '1' || hardParam === 'yes'

    // Check if agent exists, and prevent double soft-delete (which would overwrite original deletedAt)
    const agent = getAgent(params.id, true) // include deleted to distinguish 404 vs 410
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    if (agent.deletedAt && !hard) {
      return NextResponse.json({ error: 'Agent already deleted', deletedAt: agent.deletedAt }, { status: 410 })
    }

    const success = deleteAgent(params.id, hard)

    if (!success) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, hard })
  } catch (error) {
    console.error('Failed to delete agent:', error)
    return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 })
  }
}
