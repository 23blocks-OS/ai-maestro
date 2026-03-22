/**
 * AMP v1 Batch Acknowledge Endpoint
 *
 * POST /api/v1/messages/pending/ack
 *
 * Spec-correct path for batch message acknowledgment.
 * POST /api/v1/messages/pending is kept as backward-compat alias.
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { batchAcknowledgeMessages } from '@/services/amp-service'
import type { AMPError } from '@/lib/types/amp'

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
  return NextResponse.json(result.data!, { status: result.status })
}
