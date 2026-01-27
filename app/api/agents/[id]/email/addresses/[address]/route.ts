import { NextResponse } from 'next/server'
import {
  getAgent,
  getAgentEmailAddresses,
  removeEmailAddress,
  updateEmailAddress,
} from '@/lib/agent-registry'
import { emitEmailChanged } from '@/lib/webhook-service'

/**
 * DELETE /api/agents/[id]/email/addresses/[address]
 * Remove an email address from an agent
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; address: string } }
) {
  try {
    // Decode the email address (it may be URL-encoded)
    const email = decodeURIComponent(params.address)
    const normalizedEmail = email.toLowerCase().trim()

    const agent = removeEmailAddress(params.id, email)

    const addresses = getAgentEmailAddresses(params.id)

    // Emit webhook event (fire and forget)
    emitEmailChanged(
      agent.id,
      agent.name || agent.alias || 'unknown',
      agent.hostId || 'local',
      [], // added
      [normalizedEmail], // removed
      addresses.map(a => a.address) // current
    ).catch(err => console.error('[Webhook] Failed to emit email change:', err))

    return NextResponse.json({
      agentId: agent.id,
      agentName: agent.name || agent.alias,
      addresses,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove email address'

    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 })
    }

    console.error('Failed to remove email address:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/agents/[id]/email/addresses/[address]
 * Update an email address (displayName, primary, metadata)
 *
 * Request body:
 * {
 *   "displayName": "New Display Name",
 *   "primary": true,
 *   "metadata": { "key": "value" }
 * }
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; address: string } }
) {
  try {
    // Decode the email address (it may be URL-encoded)
    const email = decodeURIComponent(params.address)

    const body = await request.json()

    // Only allow updating displayName, primary, and metadata
    const updates: { displayName?: string; primary?: boolean; metadata?: Record<string, string> } = {}
    if ('displayName' in body) updates.displayName = body.displayName
    if ('primary' in body) updates.primary = body.primary
    if ('metadata' in body) updates.metadata = body.metadata

    const agent = updateEmailAddress(params.id, email, updates)

    const addresses = getAgentEmailAddresses(params.id)

    return NextResponse.json({
      agentId: agent.id,
      agentName: agent.name || agent.alias,
      addresses,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update email address'

    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 })
    }

    console.error('Failed to update email address:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/agents/[id]/email/addresses/[address]
 * Get a specific email address details
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string; address: string } }
) {
  try {
    const agent = getAgent(params.id)

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Decode the email address (it may be URL-encoded)
    const email = decodeURIComponent(params.address).toLowerCase()

    const addresses = getAgentEmailAddresses(params.id)
    const address = addresses.find(a => a.address.toLowerCase() === email)

    if (!address) {
      return NextResponse.json({ error: 'Email address not found' }, { status: 404 })
    }

    return NextResponse.json({
      agentId: agent.id,
      agentName: agent.name || agent.alias,
      address,
    })
  } catch (error) {
    console.error('Failed to get email address:', error)
    return NextResponse.json(
      { error: 'Failed to get email address' },
      { status: 500 }
    )
  }
}
