/**
 * AMP v1 Route Endpoint
 *
 * POST /api/v1/route
 *
 * Routes a message to the recipient agent within the local mesh network.
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { routeMessage } from '@/services/amp-service'
import type { AMPRouteRequest, AMPRouteResponse, AMPError } from '@/lib/types/amp'

export async function POST(request: NextRequest): Promise<NextResponse<AMPRouteResponse | AMPError>> {
  const authHeader = request.headers.get('Authorization')
  const forwardedFrom = request.headers.get('X-Forwarded-From')
  const envelopeIdHeader = request.headers.get('X-AMP-Envelope-Id')
  const signatureHeader = request.headers.get('X-AMP-Signature')
  const contentLength = request.headers.get('Content-Length')

  const body = await request.json() as AMPRouteRequest

  const result = await routeMessage(body, authHeader, forwardedFrom, envelopeIdHeader, signatureHeader, contentLength, {
    senderRole: request.headers.get('X-AMP-Sender-Role'),
    senderAgentId: request.headers.get('X-AMP-Sender-Agent-Id'),
    senderRoleAttestation: request.headers.get('X-AMP-Sender-Role-Attestation'),
  })
  if (result.error) {
    return NextResponse.json({ error: result.error, message: result.error } as AMPError, { status: result.status })
  }
  return NextResponse.json(result.data!, {
    status: result.status,
    headers: result.headers
  })
}
