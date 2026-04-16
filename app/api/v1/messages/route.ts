/**
 * AMP v1 Messages Endpoint
 *
 * GET /api/v1/messages?limit=10
 *
 * Alias for GET /api/v1/messages/pending — some AMP clients use this shorter path.
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest } from 'next/server'
import { listPendingMessages } from '@/services/amp-service'
import { toResponse } from '@/app/api/_helpers'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const { searchParams } = new URL(request.url)
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : undefined

  const result = listPendingMessages(authHeader, limit)
  return toResponse(result)
}
