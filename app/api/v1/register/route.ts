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
  let body: AMPRegistrationRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON body' } as AMPError, { status: 400 })
  }
  const authHeader = request.headers.get('Authorization')

  const result = await registerAgent(body, authHeader)
  if (result.error) {
    return NextResponse.json({ error: result.error, message: result.error } as AMPError, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
