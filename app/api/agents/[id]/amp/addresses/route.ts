import { NextRequest, NextResponse } from 'next/server'
import { listAMPAddresses, addAMPAddressToAgent } from '@/services/agents-messaging-service'

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

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
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

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
