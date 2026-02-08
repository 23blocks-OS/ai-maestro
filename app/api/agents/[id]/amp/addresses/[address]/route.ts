import { NextResponse } from 'next/server'
import {
  getAgent,
  getAgentAMPAddresses,
  removeAMPAddress,
  updateAMPAddress,
} from '@/lib/agent-registry'

/**
 * DELETE /api/agents/[id]/amp/addresses/[address]
 * Remove an AMP address from an agent
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; address: string } }
) {
  try {
    const address = decodeURIComponent(params.address)

    const agent = removeAMPAddress(params.id, address)
    const addresses = getAgentAMPAddresses(params.id)

    return NextResponse.json({
      agentId: agent.id,
      agentName: agent.name || agent.alias,
      addresses,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove AMP address'

    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 })
    }

    console.error('Failed to remove AMP address:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/agents/[id]/amp/addresses/[address]
 * Update an AMP address (displayName, primary, metadata)
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
    const address = decodeURIComponent(params.address)
    const body = await request.json()

    // Only allow updating specific fields
    const updates: { displayName?: string; primary?: boolean; metadata?: Record<string, string> } = {}
    if ('displayName' in body) updates.displayName = body.displayName
    if ('primary' in body) updates.primary = body.primary
    if ('metadata' in body) updates.metadata = body.metadata

    const agent = updateAMPAddress(params.id, address, updates)
    const addresses = getAgentAMPAddresses(params.id)

    return NextResponse.json({
      agentId: agent.id,
      agentName: agent.name || agent.alias,
      addresses,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update AMP address'

    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 })
    }

    console.error('Failed to update AMP address:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/agents/[id]/amp/addresses/[address]
 * Get a specific AMP address details
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

    const ampAddress = decodeURIComponent(params.address).toLowerCase()
    const addresses = getAgentAMPAddresses(params.id)
    const address = addresses.find(a => a.address.toLowerCase() === ampAddress)

    if (!address) {
      return NextResponse.json({ error: 'AMP address not found' }, { status: 404 })
    }

    return NextResponse.json({
      agentId: agent.id,
      agentName: agent.name || agent.alias,
      address,
    })
  } catch (error) {
    console.error('Failed to get AMP address:', error)
    return NextResponse.json(
      { error: 'Failed to get AMP address' },
      { status: 500 }
    )
  }
}
