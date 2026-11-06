/**
 * Reactions on an agent's chat messages (#799). The fixed set: 👍 👎 ❓ ✅ 👀 ❤️
 *
 * GET    /api/agents/:id/chat/reactions?ids=<uuid>,<uuid>  — { reactions: { [messageId]: [{ emoji, by, byKind, byName, at }] } }
 * POST   /api/agents/:id/chat/reactions                    — { messageId, emoji, deviceId? | agentId? }
 * DELETE /api/agents/:id/chat/reactions                    — the same body
 *
 * Thin wrapper — business logic in services/chat-reactions-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { addChatReaction, listChatReactions, removeChatReaction } from '@/services/chat-reactions-service'
import { toResponse } from '@/app/api/_helpers'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  return toResponse(listChatReactions(id, request.nextUrl.searchParams.get('ids')))
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  return toResponse(await addChatReaction(id, body))
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  return toResponse(removeChatReaction(id, body))
}
