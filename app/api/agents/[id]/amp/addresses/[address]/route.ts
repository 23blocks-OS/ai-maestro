import { NextRequest, NextResponse } from 'next/server'
import {
  getAMPAddress,
  updateAMPAddressOnAgent,
  removeAMPAddressFromAgent,
} from '@/services/agents-messaging-service'
import { isValidUuid } from '@/lib/validation'

/**
 * GET /api/agents/[id]/amp/addresses/[address]
 * Get a specific AMP address details
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; address: string }> }
) {
  const { id, address } = await params
  // SF-009: Validate UUID format for agent ID (defense-in-depth)
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
  }

  const result = getAMPAddress(id, address)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * PATCH /api/agents/[id]/amp/addresses/[address]
 * Update an AMP address (displayName, primary, metadata)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; address: string }> }
) {
  const { id, address } = await params
  // SF-009: Validate UUID format for agent ID (defense-in-depth)
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
  }
  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await updateAMPAddressOnAgent(id, address, body)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * DELETE /api/agents/[id]/amp/addresses/[address]
 * Remove an AMP address from an agent
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; address: string }> }
) {
  const { id, address } = await params
  // SF-009: Validate UUID format for agent ID (defense-in-depth)
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
  }

  const result = await removeAMPAddressFromAgent(id, address)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
