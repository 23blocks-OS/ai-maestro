/**
 * AMP v1 Pending Messages Endpoint
 *
 * GET /api/v1/messages/pending?limit=10
 * DELETE /api/v1/messages/pending?id=<messageId>
 * POST /api/v1/messages/pending (batch ack)
 *
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { listPendingMessages, acknowledgePendingMessage, batchAcknowledgeMessages } from '@/services/amp-service'
import type { AMPError, AMPPendingMessagesResponse } from '@/lib/types/amp'

export async function GET(request: NextRequest): Promise<NextResponse<AMPPendingMessagesResponse | AMPError>> {
  const authHeader = request.headers.get('Authorization')
  const { searchParams } = new URL(request.url)
  const limitParam = searchParams.get('limit')
  // CC-P3-005: NaN guard — discard non-numeric limit values
  const parsed = limitParam ? parseInt(limitParam, 10) : NaN
  const limit = Number.isNaN(parsed) ? undefined : parsed

  const result = listPendingMessages(authHeader, limit)
  if (result.error) {
    return NextResponse.json({ error: result.error, message: result.error } as AMPError, { status: result.status })
  }
  return NextResponse.json(result.data, {
    status: result.status,
    headers: result.headers
  })
}

export async function DELETE(request: NextRequest): Promise<NextResponse<{ acknowledged: boolean } | AMPError>> {
  const authHeader = request.headers.get('Authorization')
  const { searchParams } = new URL(request.url)
  const messageId = searchParams.get('id')

  const result = acknowledgePendingMessage(authHeader, messageId)
  if (result.error) {
    return NextResponse.json({ error: result.error, message: result.error } as AMPError, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}

export async function POST(request: NextRequest): Promise<NextResponse<{ acknowledged: number } | AMPError>> {
  const authHeader = request.headers.get('Authorization')

  let body: { ids?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({
      error: 'invalid_request',
      message: 'Invalid JSON body'
    } as AMPError, { status: 400 })
  }

  const result = batchAcknowledgeMessages(authHeader, body.ids)
  if (result.error) {
    return NextResponse.json({ error: result.error, message: result.error } as AMPError, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
