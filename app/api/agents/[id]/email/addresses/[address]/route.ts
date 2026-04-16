import { NextRequest } from 'next/server'
import {
  getEmailAddressDetail,
  updateEmailAddressOnAgent,
  removeEmailAddressFromAgent,
} from '@/services/agents-messaging-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/agents/[id]/email/addresses/[address]
 * Get a specific email address details
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; address: string }> }
) {
  const { id, address } = await params

  const result = getEmailAddressDetail(id, address)
  return toResponse(result)
}

/**
 * PATCH /api/agents/[id]/email/addresses/[address]
 * Update an email address (displayName, primary, metadata)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; address: string }> }
) {
  const { id, address } = await params
  const body = await request.json()

  const result = updateEmailAddressOnAgent(id, address, body)
  return toResponse(result)
}

/**
 * DELETE /api/agents/[id]/email/addresses/[address]
 * Remove an email address from an agent
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; address: string }> }
) {
  const { id, address } = await params

  const result = removeEmailAddressFromAgent(id, address)
  return toResponse(result)
}
