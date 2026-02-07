/**
 * AMP v1 Read Receipt
 *
 * POST /api/v1/messages/:id/read — Send read receipt for a message
 *
 * Notifies the original sender that the recipient has read the message.
 * Delivery is best-effort via WebSocket (if sender is connected).
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/amp-auth'
import { deliverViaWebSocket } from '@/lib/amp-websocket'
import type { AMPError, AMPEnvelope, AMPPayload } from '@/lib/types/amp'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = request.headers.get('Authorization')
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return NextResponse.json({
      error: auth.error || 'unauthorized',
      message: auth.message || 'Authentication required'
    } as AMPError, { status: 401 })
  }

  const { id: messageId } = await params

  // Build read receipt envelope
  const receiptEnvelope: AMPEnvelope = {
    version: 'amp/0.1',
    id: `receipt_read_${messageId}_${Date.now()}`,
    from: auth.address!,
    to: '', // Will be filled from request body
    subject: `Read: ${messageId}`,
    priority: 'low',
    timestamp: new Date().toISOString(),
    signature: '',
    thread_id: messageId,
    in_reply_to: messageId,
  }

  const receiptPayload: AMPPayload = {
    type: 'ack',
    message: `Message ${messageId} has been read`,
    context: {
      receipt_type: 'read',
      original_message_id: messageId,
      read_at: new Date().toISOString(),
      reader: auth.address,
    },
  }

  // Try body for original sender address
  let originalSenderAddress: string | undefined
  try {
    const body = await request.json()
    originalSenderAddress = body.original_sender
    if (originalSenderAddress) {
      receiptEnvelope.to = originalSenderAddress
    }
  } catch {
    // No body is fine
  }

  // Attempt WebSocket delivery to original sender
  let delivered = false
  if (originalSenderAddress) {
    delivered = deliverViaWebSocket(originalSenderAddress, receiptEnvelope, receiptPayload)
  }

  return NextResponse.json({
    receipt_sent: true,
    message_id: messageId,
    delivered_via: delivered ? 'websocket' : 'none',
    read_at: new Date().toISOString(),
  })
}
