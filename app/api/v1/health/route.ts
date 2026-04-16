/**
 * AMP v1 Health Check Endpoint
 *
 * GET /api/v1/health
 *
 * Returns provider health status and basic metrics.
 * No authentication required - used for monitoring and load balancers.
 */

import { NextRequest } from 'next/server'
import { getHealthStatus } from '@/services/amp-service'
import { toResponse } from '@/app/api/_helpers'

export async function GET(_request: NextRequest) {
  const result = getHealthStatus()
  return toResponse(result)
}
