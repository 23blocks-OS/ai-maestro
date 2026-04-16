import { NextRequest } from 'next/server'
import { listAMPAddresses, addAMPAddressToAgent } from '@/services/agents-messaging-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/agents/[id]/amp/addresses
 * Get all AMP addresses for an agent
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const result = listAMPAddresses(id)
  return toResponse(result)
}

/**
 * POST /api/agents/[id]/amp/addresses
 * Add an AMP address to an agent
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  const result = addAMPAddressToAgent(id, body)
  return toResponse(result)
}
