/**
 * AMP v1 Health Check Endpoint
 *
 * GET /api/v1/health
 *
 * Returns provider health status and basic metrics.
 * No authentication required - used for monitoring and load balancers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getHealthStatus } from '@/services/amp-service'
import type { AMPHealthResponse } from '@/lib/types/amp'

export async function GET(_request: NextRequest): Promise<NextResponse<AMPHealthResponse | { error: string }>> {
  const result = getHealthStatus()
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data!, {
    status: result.status,
    headers: result.headers
  })
}
