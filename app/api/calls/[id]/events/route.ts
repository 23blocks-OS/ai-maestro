/**
 * POST /api/calls/:id/events  — { type, eventId, actor, deviceId? }
 * type: rtc:ringing | rtc:accept | rtc:reject | rtc:cancel | rtc:connected | rtc:end | rtc:failed.
 * Repeating an eventId is safe: the answer is the current call with duplicate: true.
 */

import { NextRequest } from 'next/server'
import { sendCallEvent } from '@/services/calls-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // A JSON null or number is not a body: treat it as empty rather than failing with a 500
  const parsed = await request.json().catch(() => ({}))
  const body = parsed && typeof parsed === 'object' ? parsed : {}
  return toResponse(sendCallEvent(id, body))
}
