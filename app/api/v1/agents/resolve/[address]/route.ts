/**
 * AMP v1 Agent Address Resolution
 *
 * GET /api/v1/agents/resolve/:address
 *
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveAgentAddress } from '@/services/amp-service'

export async function GET(
  request: NextRequest,
  { params }: { params: { address: string } }
) {
  const authHeader = request.headers.get('Authorization')
  const { address } = params

  const result = resolveAgentAddress(authHeader, address)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
