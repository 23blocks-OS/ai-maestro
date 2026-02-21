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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await deliverFederated(providerName, body)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, {
    status: result.status,
    headers: result.headers
  })
}
