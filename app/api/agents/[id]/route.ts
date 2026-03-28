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

    // Snapshot registry BEFORE for transactional undo
    const { beginTransaction, commitTransaction, discardTransaction } = await import('@/lib/config-transaction')
    const registryPath = require('path').join(require('os').homedir(), '.aimaestro', 'agents', 'registry.json')
    const fieldNames = Object.keys(body).filter(k => body[k as keyof UpdateAgentRequest] !== undefined).join(', ')
    const txId = await beginTransaction({
      description: `Edit agent ${id.substring(0, 8)}: ${fieldNames}`,
      operation: 'field:edit',
      scope: 'global',
      agentId: id,
      configFiles: { registry_json: registryPath },
    })

    try {
      const result = await updateAgentById(id, body)
      if (result.error) {
        discardTransaction(txId)
        return NextResponse.json({ error: result.error }, { status: result.status })
      }
      commitTransaction(txId)
      return NextResponse.json(result.data)
    } catch (innerError) {
      discardTransaction(txId)
      throw innerError
    }
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
