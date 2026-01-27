import { NextResponse } from 'next/server'
import {
  getAgent,
  getAgentEmailAddresses,
  addEmailAddress,
} from '@/lib/agent-registry'
import { emitEmailChanged } from '@/lib/webhook-service'
import type { AddEmailAddressRequest, EmailConflictError } from '@/types/agent'

/**
 * GET /api/agents/[id]/email/addresses
 * Get all email addresses for an agent
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

    const addresses = getAgentEmailAddresses(params.id)

    return NextResponse.json({
      agentId: agent.id,
      agentName: agent.name || agent.alias,
      addresses,
    })
  } catch (error) {
    console.error('Failed to get email addresses:', error)
    return NextResponse.json(
      { error: 'Failed to get email addresses' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/agents/[id]/email/addresses
 * Add an email address to an agent
 *
 * Request body:
 * {
 *   "address": "email@example.com",
 *   "displayName": "My Email",
 *   "primary": false,
 *   "metadata": { "key": "value" }
 * }
 *
 * Returns 201 on success, 409 if address is already claimed
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body: AddEmailAddressRequest = await request.json()

    if (!body.address) {
      return NextResponse.json(
        { error: 'Email address is required' },
        { status: 400 }
      )
    }

    const agent = addEmailAddress(params.id, {
      address: body.address,
      displayName: body.displayName,
      primary: body.primary,
      metadata: body.metadata,
    })

    const addresses = getAgentEmailAddresses(params.id)

    // Emit webhook event (fire and forget)
    const normalizedAddress = body.address.toLowerCase().trim()
    emitEmailChanged(
      agent.id,
      agent.name || agent.alias || 'unknown',
      agent.hostId || 'local',
      [normalizedAddress], // added
      [], // removed
      addresses.map(a => a.address) // current
    ).catch(err => console.error('[Webhook] Failed to emit email change:', err))

    return NextResponse.json(
      {
        agentId: agent.id,
        agentName: agent.name || agent.alias,
        addresses,
      },
      { status: 201 }
    )
  } catch (error) {
    // Check if this is a conflict error
    if (error && typeof error === 'object' && 'error' in error && (error as EmailConflictError).error === 'conflict') {
      return NextResponse.json(error, { status: 409 })
    }

    const message = error instanceof Error ? error.message : 'Failed to add email address'

    // Check for specific error messages
    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    if (message.includes('Invalid email') || message.includes('Maximum of 10') || message.includes('already exists')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }

    console.error('Failed to add email address:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
