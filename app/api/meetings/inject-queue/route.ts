/**
 * Meeting Inject Queue API
 *
 * GET /api/meetings/inject-queue?session=<tmuxSessionName>
 *
 * Called by the ai-maestro hook on SessionStart and Notification(idle_prompt)
 * to drain queued meeting messages for injection via additionalContext.
 * Destructive read — messages are removed after retrieval.
 */

import { NextRequest, NextResponse } from 'next/server'
import { drainForSession } from '@/lib/meeting-inject-queue'

export async function GET(req: NextRequest) {
  const session = req.nextUrl.searchParams.get('session')
  if (!session) {
    return NextResponse.json({ error: 'Missing session parameter' }, { status: 400 })
  }

  const messages = drainForSession(session)
  return NextResponse.json({ messages, count: messages.length })
}
