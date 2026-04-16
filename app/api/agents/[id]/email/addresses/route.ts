import { NextRequest } from 'next/server'
import { listEmailAddresses, addEmailAddressToAgent } from '@/services/agents-messaging-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/agents/[id]/email/addresses
 * Get all email addresses for an agent
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const result = listEmailAddresses(id)
  return toResponse(result)
}

/**
 * POST /api/agents/[id]/email/addresses
 * Add an email address to an agent
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  const result = addEmailAddressToAgent(id, body)
  return toResponse(result)
}
