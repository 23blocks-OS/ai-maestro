/**
 * AMP v1 Provider Info Endpoint
 *
 * GET /api/v1/info
 *
 * Returns provider information including capabilities, registration modes,
 * and rate limits. No authentication required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProviderInfo } from '@/services/amp-service'
import type { AMPInfoResponse } from '@/lib/types/amp'

export async function GET(_request: NextRequest): Promise<NextResponse<AMPInfoResponse>> {
  const result = getProviderInfo()
  return NextResponse.json(result.data!, {
    status: result.status,
    headers: result.headers
  })
}
