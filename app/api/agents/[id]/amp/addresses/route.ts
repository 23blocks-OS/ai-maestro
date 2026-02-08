import { NextResponse } from 'next/server'
import {
  getAgent,
  getAgentAMPAddresses,
  addAMPAddress,
} from '@/lib/agent-registry'
import type { AddAMPAddressRequest } from '@/types/agent'

/**
 * GET /api/agents/[id]/amp/addresses
 * Get all AMP addresses for an agent
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const agent = getAgent(params.id)

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const addresses = getAgentAMPAddresses(params.id)

    return NextResponse.json({
      agentId: agent.id,
      agentName: agent.name || agent.alias,
      addresses,
    })
  } catch (error) {
    console.error('Failed to get AMP addresses:', error)
    return NextResponse.json(
      { error: 'Failed to get AMP addresses' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/agents/[id]/amp/addresses
 * Add an AMP address to an agent
 *
 * Request body:
 * {
 *   "address": "alice@acme.aimaestro.local",
 *   "provider": "aimaestro.local",
 *   "type": "local",
 *   "tenant": "acme",
 *   "primary": false,
 *   "displayName": "Alice",
 *   "metadata": { "key": "value" }
 * }
 *
 * Returns 201 on success, 400 on validation error
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body: AddAMPAddressRequest = await request.json()

    if (!body.address) {
      return NextResponse.json(
        { error: 'AMP address is required' },
        { status: 400 }
      )
    }

    if (!body.provider) {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 }
      )
    }

    if (!body.type || !['local', 'cloud'].includes(body.type)) {
      return NextResponse.json(
        { error: 'Type must be "local" or "cloud"' },
        { status: 400 }
      )
    }

    const agent = addAMPAddress(params.id, {
      address: body.address,
      provider: body.provider,
      type: body.type,
      tenant: body.tenant,
      primary: body.primary,
      displayName: body.displayName,
      metadata: body.metadata,
    })

    const addresses = getAgentAMPAddresses(params.id)

    return NextResponse.json(
      {
        agentId: agent.id,
        agentName: agent.name || agent.alias,
        addresses,
      },
      { status: 201 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add AMP address'

    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    if (message.includes('Invalid AMP') || message.includes('Maximum of 10') || message.includes('already claimed')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }

    console.error('Failed to add AMP address:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
