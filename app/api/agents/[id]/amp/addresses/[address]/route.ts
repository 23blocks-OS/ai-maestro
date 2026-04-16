import { NextRequest } from 'next/server'
import {
  getAMPAddress,
  updateAMPAddressOnAgent,
  removeAMPAddressFromAgent,
} from '@/services/agents-messaging-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/agents/[id]/amp/addresses/[address]
 * Get a specific AMP address details
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; address: string }> }
) {
  const { id, address } = await params

  const result = getAMPAddress(id, address)
  return toResponse(result)
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
  const body = await request.json()

  const result = updateAMPAddressOnAgent(id, address, body)
  return toResponse(result)
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

  const result = removeAMPAddressFromAgent(id, address)
  return toResponse(result)
}
