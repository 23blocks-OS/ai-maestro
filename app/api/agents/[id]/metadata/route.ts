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
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    let metadata
    try { metadata = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    // Validate metadata is a plain object with depth/size limits
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return NextResponse.json({ error: 'Metadata must be a plain object' }, { status: 400 })
    }
    const metadataStr = JSON.stringify(metadata)
    if (metadataStr.length > 65536) {
      return NextResponse.json({ error: 'Metadata exceeds maximum size (64KB)' }, { status: 400 })
    }
    // Check nesting depth (max 5 levels)
    const checkDepth = (obj: unknown, depth: number): boolean => {
      if (depth > 5) return false
      if (obj !== null && typeof obj === 'object') {
        for (const val of Object.values(obj as Record<string, unknown>)) {
          if (!checkDepth(val, depth + 1)) return false
        }
      }
      return true
    }
    if (!checkDepth(metadata, 1)) {
      return NextResponse.json({ error: 'Metadata exceeds maximum nesting depth (5)' }, { status: 400 })
    }

    const agent = await updateAgent(agentId, { metadata })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({ metadata: agent.metadata })
  } catch (error) {
    // Differentiate validation errors (400) from internal errors (500)
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
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    // MF-001 fix: Read current metadata keys and set each to undefined,
    // because updateAgent merges via spread (empty object is a no-op)
    const existing = getAgent(agentId)
    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    const nulledMetadata: Record<string, undefined> = {}
    if (existing.metadata) {
      for (const key of Object.keys(existing.metadata)) {
        nulledMetadata[key] = undefined
      }
    }
    const agent = await updateAgent(agentId, { metadata: nulledMetadata as Record<string, unknown> })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to clear agent metadata:', error)
    return NextResponse.json({ error: 'Failed to clear metadata' }, { status: 500 })
  }
}
