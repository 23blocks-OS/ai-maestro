/**
 * AMP v1 Federation Delivery Endpoint
 *
 * POST /api/v1/federation/deliver
 *
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { deliverFederated } from '@/services/amp-service'

export async function POST(request: NextRequest) {
  const providerName = request.headers.get('X-AMP-Provider')

  const body = await request.json()

  const result = await deliverFederated(providerName, body)
  return NextResponse.json(result.data!, {
    status: result.status,
    headers: result.headers
  })
}
