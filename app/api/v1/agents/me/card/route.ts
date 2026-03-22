/**
 * AMP v1 Agent Card Endpoint
 *
 * GET /api/v1/agents/me/card
 *
 * Returns a signed agent card with public key and identity info.
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAgentCard } from '@/services/amp-service'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const result = getAgentCard(authHeader)
  return NextResponse.json(result.data!, { status: result.status })
}
