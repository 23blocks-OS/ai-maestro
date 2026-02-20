import { NextResponse } from 'next/server'
import { getAgentById, updateAgentById, deleteAgentById } from '@/services/agents-core-service'
import type { UpdateAgentRequest } from '@/types/agent'

/**
 * GET /api/agents/[id]
 * Get a specific agent by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = getAgentById(id)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * PATCH /api/agents/[id]
 * Update an agent
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body: UpdateAgentRequest = await request.json()
  const result = updateAgentById(id, body)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * DELETE /api/agents/[id]
 * Delete an agent. Soft-delete by default (preserves data, marks as deleted).
 * Pass ?hard=true for permanent deletion (creates backup first).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = new URL(request.url)
  const hardParam = url.searchParams.get('hard')?.toLowerCase()
  const hard = hardParam === 'true' || hardParam === '1' || hardParam === 'yes'

  const result = deleteAgentById(id, hard)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
