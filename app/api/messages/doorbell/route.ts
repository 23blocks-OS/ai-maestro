import { NextRequest, NextResponse } from 'next/server'
import { ringDoorbellService } from '@/services/doorbell-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/messages/doorbell
 * A sender that wrote a message straight into a same-host recipient's inbox
 * (amp-send.sh) rings this so the agent is woken now, not at the next sweep.
 * Body: { recipient, messageId }. Idempotent. Lib: lib/doorbell.ts.
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'body must be JSON' }, { status: 400 })
  }
  return toResponse(await ringDoorbellService(body))
}
