/**
 * AMP v1 Health Check Endpoint
 *
 * GET /api/v1/health
 *
 * Returns provider health status and basic metrics.
 * No authentication required - used for monitoring and load balancers.
 */

// NT-010: Simplified import — NextRequest not needed since _request param is unused for Next.js-specific features
import { NextResponse } from 'next/server'
import { getHealthStatus } from '@/services/amp-service'
import type { AMPHealthResponse } from '@/lib/types/amp'

// NT-013: Prefix unused request parameter with underscore
export async function GET(_request: Request): Promise<NextResponse<AMPHealthResponse | { error: string }>> {
  const result = getHealthStatus()
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  // SF-015: Guard against missing data — return error instead of empty object
  if (!result.data) {
    return NextResponse.json({ error: 'Health data unavailable' }, { status: 500 })
  }
  return NextResponse.json(result.data, {
    status: result.status,
    headers: result.headers
  })
}
