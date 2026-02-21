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

export async function GET(_request: NextRequest): Promise<NextResponse<AMPInfoResponse | { error: string }>> {
  const result = getProviderInfo()
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, {
    status: result.status,
    headers: result.headers
  })
}
