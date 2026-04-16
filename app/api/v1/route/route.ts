/**
 * AMP v1 Route Endpoint
 *
 * POST /api/v1/route
 *
 * Routes a message to the recipient agent within the local mesh network.
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest } from 'next/server'
import { routeMessage } from '@/services/amp-service'
import { toResponse } from '@/app/api/_helpers'
import type { AMPRouteRequest } from '@/lib/types/amp'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const forwardedFrom = request.headers.get('X-Forwarded-From')
  const envelopeIdHeader = request.headers.get('X-AMP-Envelope-Id')
  const signatureHeader = request.headers.get('X-AMP-Signature')
  const contentLength = request.headers.get('Content-Length')

  const body = await request.json() as AMPRouteRequest

  const result = await routeMessage(body, authHeader, forwardedFrom, envelopeIdHeader, signatureHeader, contentLength)
  return toResponse(result)
}
