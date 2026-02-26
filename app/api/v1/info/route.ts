/**
 * AMP v1 Provider Info Endpoint
 *
 * GET /api/v1/info
 *
 * Returns provider information including capabilities, registration modes,
 * and rate limits. No authentication required.
 */

// NT-010: Simplified import — NextRequest not needed since _request param is unused for Next.js-specific features
import { NextResponse } from 'next/server'
import { getProviderInfo } from '@/services/amp-service'
import type { AMPInfoResponse } from '@/lib/types/amp'

// NT-013: Prefix unused request parameter with underscore
export async function GET(_request: Request): Promise<NextResponse<AMPInfoResponse | { error: string }>> {
  const result = getProviderInfo()
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  // Guard against null/undefined data -- service should always return data on success
  if (!result.data) {
    return NextResponse.json({ error: 'Provider info unavailable' }, { status: 500 })
  }
  return NextResponse.json(result.data as AMPInfoResponse, {
    status: result.status,
    headers: result.headers
  })
}
