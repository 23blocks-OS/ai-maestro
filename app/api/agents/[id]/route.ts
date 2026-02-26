import { NextRequest, NextResponse } from 'next/server'
import { getAgentById, updateAgentById, deleteAgentById } from '@/services/agents-core-service'
import type { UpdateAgentRequest } from '@/types/agent'
import { isValidUuid } from '@/lib/validation'

/**
 * GET /api/agents/[id]
 * Get a specific agent by ID
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const result = getAgentById(id)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Agents GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/agents/[id]
 * Update an agent
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    let body: UpdateAgentRequest
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const result = await updateAgentById(id, body)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Agents PATCH] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/agents/[id]
 * Delete an agent. Soft-delete by default (preserves data, marks as deleted).
 * Pass ?hard=true for permanent deletion (creates backup first).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const hardParam = request.nextUrl.searchParams.get('hard')?.toLowerCase()
    const hard = hardParam === 'true' || hardParam === '1' || hardParam === 'yes'

    const result = await deleteAgentById(id, hard)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Agents DELETE] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
