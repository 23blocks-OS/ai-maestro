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
import { toResponse } from '@/app/api/_helpers'
import type { AMPError } from '@/lib/types/amp'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const { searchParams } = new URL(request.url)
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : undefined

  const result = listPendingMessages(authHeader, limit)
  return toResponse(result)
}

export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const { searchParams } = new URL(request.url)
  const messageId = searchParams.get('id')

  const result = acknowledgePendingMessage(authHeader, messageId)
  return toResponse(result)
}

export async function POST(request: NextRequest) {
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
  return toResponse(result)
}
