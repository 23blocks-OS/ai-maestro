/**
 * AMP v1 Registration Endpoint
 *
 * POST /api/v1/register
 *
 * Registers a new agent with the local AMP provider.
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { registerAgent } from '@/services/amp-service'
import type { AMPRegistrationRequest, AMPRegistrationResponse, AMPError, AMPNameTakenError } from '@/lib/types/amp'

export async function POST(request: NextRequest): Promise<NextResponse<AMPRegistrationResponse | AMPError | AMPNameTakenError>> {
  const body = await request.json() as AMPRegistrationRequest
  const authHeader = request.headers.get('Authorization')

  const result = await registerAgent(body, authHeader)
  return NextResponse.json(result.data!, { status: result.status })
}
