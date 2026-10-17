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

  // The provider signs the raw body, so read the text and parse it ourselves.
  const rawBody = await request.text()
  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await deliverFederated(providerName, body, {
    signature: request.headers.get('X-AMP-Signature'),
    timestamp: request.headers.get('X-AMP-Timestamp'),
    rawBody,
  })
  return NextResponse.json(result.data!, {
    status: result.status,
    headers: result.headers
  })
}
