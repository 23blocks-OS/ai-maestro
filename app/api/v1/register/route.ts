/**
 * AMP v1 Registration Endpoint
 *
 * POST /api/v1/register
 *
 * Registers a new agent with the local AMP provider.
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest } from 'next/server'
import { registerAgent } from '@/services/amp-service'
import { toResponse } from '@/app/api/_helpers'
import type { AMPRegistrationRequest } from '@/lib/types/amp'

export async function POST(request: NextRequest) {
  const body = await request.json() as AMPRegistrationRequest
  const authHeader = request.headers.get('Authorization')

  const result = await registerAgent(body, authHeader)
  return toResponse(result)
}
