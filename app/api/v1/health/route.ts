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
  // SF-012: Use nullish coalescing instead of non-null assertion to avoid passing undefined
  return NextResponse.json(result.data ?? {} as AMPHealthResponse, {
    status: result.status,
    headers: result.headers
  })
}
