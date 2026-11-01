/**
 * GET  /api/people/:id/messages?box=inbox|sent&since=<iso>&limit=  — the person's mailbox, newest first
 * GET  /api/people/:id/messages?with=<agent address>               — one conversation, both boxes, oldest first
 * POST /api/people/:id/messages — send as the person from a device:
 *      { to, subject, priority?, in_reply_to?, payload: { type, message, context: { sent_at, nonce } }, key_id, signature }
 *      See docs/PERSON-SIGNING.md.
 */

import { NextRequest } from 'next/server'
import { listPersonMessages, sendAsPerson } from '@/services/person-messages-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const q = request.nextUrl.searchParams
  return toResponse(listPersonMessages(id, { box: q.get('box'), since: q.get('since'), with: q.get('with'), limit: q.get('limit') }))
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const parsed = await request.json().catch(() => ({}))
  return toResponse(await sendAsPerson(id, parsed && typeof parsed === 'object' ? parsed : {}))
}
