import { NextRequest, NextResponse } from 'next/server'
import { listEmailAddresses, addEmailAddressToAgent } from '@/services/agents-messaging-service'

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

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
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
  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = addEmailAddressToAgent(id, body)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  // Handle conflict (409) — service returns data (not error) for conflicts
  return NextResponse.json(result.data, { status: result.status })
}
