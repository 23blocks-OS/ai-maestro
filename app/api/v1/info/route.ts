/**
 * AMP v1 Provider Info Endpoint
 *
 * GET /api/v1/info
 *
 * Returns provider information including capabilities, registration modes,
 * and rate limits. No authentication required.
 */

import { NextRequest } from 'next/server'
import { getProviderInfo } from '@/services/amp-service'
import { toResponse } from '@/app/api/_helpers'

export async function GET(_request: NextRequest) {
  const result = getProviderInfo()
  return toResponse(result)
}
