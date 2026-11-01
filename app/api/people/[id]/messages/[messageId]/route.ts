/**
 * GET   /api/people/:id/messages/:messageId                                  — one message
 * PATCH /api/people/:id/messages/:messageId { status: unread|read|archived } — read state, shared by the person's devices
 */

import { NextRequest } from 'next/server'
import { getPersonMessage, updatePersonMessage } from '@/services/person-messages-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; messageId: string }> }

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id, messageId } = await params
  return toResponse(getPersonMessage(id, messageId))
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id, messageId } = await params
  const parsed = await request.json().catch(() => ({}))
  return toResponse(updatePersonMessage(id, messageId, parsed && typeof parsed === 'object' ? parsed : {}))
}
