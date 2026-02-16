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
  { params }: { params: Promise<{ address: string }> }
) {
  const authHeader = request.headers.get('Authorization')
  const { address } = await params

  const result = resolveAgentAddress(authHeader, address)
  return NextResponse.json(result.data!, { status: result.status })
}
