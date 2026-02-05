/**
 * AMP v1 Pending Messages Endpoint
 *
 * GET /api/v1/messages/pending?limit=10
 *   - List pending (queued) messages for the authenticated agent
 *   - Requires Bearer token authentication
 *
 * DELETE /api/v1/messages/pending?id=<messageId>
 *   - Acknowledge receipt of a message (removes from queue)
 *
 * POST /api/v1/messages/pending/ack
 *   - Batch acknowledge multiple messages
 *   - Body: { "ids": ["msg_001", "msg_002", ...] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/amp-auth'
import {
  getPendingMessages,
  acknowledgeMessage,
  acknowledgeMessages
} from '@/lib/amp-relay'
import type { AMPError, AMPPendingMessagesResponse } from '@/lib/types/amp'

/**
 * GET /api/v1/messages/pending
 * List pending messages for the authenticated agent
 */
export async function GET(request: NextRequest): Promise<NextResponse<AMPPendingMessagesResponse | AMPError>> {
  // Authenticate request
  const authHeader = request.headers.get('Authorization')
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return NextResponse.json({
      error: auth.error || 'unauthorized',
      message: auth.message || 'Authentication required'
    } as AMPError, { status: 401 })
  }

  // Parse query parameters
  const { searchParams } = new URL(request.url)
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 10

  // Get pending messages for this agent
  const result = getPendingMessages(auth.agentId!, limit)

  return NextResponse.json(result, {
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  })
}

/**
 * DELETE /api/v1/messages/pending?id=<messageId>
 * Acknowledge receipt of a single message
 */
export async function DELETE(request: NextRequest): Promise<NextResponse<{ acknowledged: boolean } | AMPError>> {
  // Authenticate request
  const authHeader = request.headers.get('Authorization')
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return NextResponse.json({
      error: auth.error || 'unauthorized',
      message: auth.message || 'Authentication required'
    } as AMPError, { status: 401 })
  }

  // Get message ID from query params
  const { searchParams } = new URL(request.url)
  const messageId = searchParams.get('id')

  if (!messageId) {
    return NextResponse.json({
      error: 'missing_field',
      message: 'Message ID required (use ?id=<messageId>)',
      field: 'id'
    } as AMPError, { status: 400 })
  }

  // Acknowledge the message
  const acknowledged = acknowledgeMessage(auth.agentId!, messageId)

  if (!acknowledged) {
    return NextResponse.json({
      error: 'not_found',
      message: `Message ${messageId} not found in pending queue`
    } as AMPError, { status: 404 })
  }

  return NextResponse.json({ acknowledged: true })
}

/**
 * POST /api/v1/messages/pending/ack
 * Batch acknowledge multiple messages
 * Note: This route is defined here but Next.js doesn't support nested routes well
 * The actual batch endpoint would be at /api/v1/messages/pending/ack/route.ts
 * For now, we handle it via POST to this endpoint with body
 */
export async function POST(request: NextRequest): Promise<NextResponse<{ acknowledged: number } | AMPError>> {
  // Authenticate request
  const authHeader = request.headers.get('Authorization')
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return NextResponse.json({
      error: auth.error || 'unauthorized',
      message: auth.message || 'Authentication required'
    } as AMPError, { status: 401 })
  }

  // Parse body
  let body: { ids?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({
      error: 'invalid_request',
      message: 'Invalid JSON body'
    } as AMPError, { status: 400 })
  }

  if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({
      error: 'missing_field',
      message: 'ids array required',
      field: 'ids'
    } as AMPError, { status: 400 })
  }

  // Limit batch size
  if (body.ids.length > 100) {
    return NextResponse.json({
      error: 'invalid_request',
      message: 'Maximum 100 messages per batch'
    } as AMPError, { status: 400 })
  }

  // Acknowledge messages
  const acknowledged = acknowledgeMessages(auth.agentId!, body.ids)

  return NextResponse.json({ acknowledged })
}
