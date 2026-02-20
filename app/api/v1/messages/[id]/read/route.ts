/**
 * AMP v1 Read Receipt
 *
 * POST /api/v1/messages/:id/read
 *
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendReadReceipt } from '@/services/amp-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = request.headers.get('Authorization')
  const { id: messageId } = await params

  let originalSender: string | undefined
  try {
    const body = await request.json()
    originalSender = body.original_sender
  } catch {
    // No body is fine
  }

  const result = await sendReadReceipt(authHeader, messageId, originalSender)
  return NextResponse.json(result.data!, { status: result.status })
}
