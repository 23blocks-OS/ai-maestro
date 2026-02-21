/**
 * AMP v1 Federation Delivery Endpoint
 *
 * POST /api/v1/federation/deliver
 *
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { deliverFederated } from '@/services/amp-service'
import type { AMPEnvelope, AMPPayload } from '@/lib/types/amp'

/** Expected shape of the federation delivery request body */
interface FederationDeliverBody {
  envelope: AMPEnvelope
  payload: AMPPayload
  sender_public_key?: string
}

export async function POST(request: NextRequest) {
  try {
    const providerName = request.headers.get('X-AMP-Provider')

    let body: FederationDeliverBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON body' }, { status: 400 })
    }

    // CC-P4-004: Basic structural validation before passing to service
    if (!body || typeof body !== 'object' || !body.envelope || !body.payload) {
      return NextResponse.json({ error: 'invalid_request', message: 'Body must contain envelope and payload' }, { status: 400 })
    }

    const result = await deliverFederated(providerName, body)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, {
      status: result.status,
      headers: result.headers
    })
  } catch (error) {
    // CC-P4-003: Top-level catch for unhandled service throws (consistent with agents/route.ts pattern)
    return NextResponse.json(
      { error: 'internal_error', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
