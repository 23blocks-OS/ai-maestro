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
  { params }: { params: { id: string } }
) {
  const authHeader = request.headers.get('Authorization')
  const { id: messageId } = params

  let originalSender: string | undefined
  try {
    const body = await request.json()
    originalSender = body.original_sender
  } catch {
    // No body is fine
  }

  const result = await sendReadReceipt(authHeader, messageId, originalSender)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
