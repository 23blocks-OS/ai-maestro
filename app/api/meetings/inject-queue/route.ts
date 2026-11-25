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
import { callerFromHeaders, checkMailbox, agentIdOfSession } from '@/lib/caller-identity'

export async function GET(req: NextRequest) {
  const session = req.nextUrl.searchParams.get('session')
  if (!session) {
    return NextResponse.json({ error: 'Missing session parameter' }, { status: 400 })
  }

  // The queue is the session's agent's mail: an agent drains its own
  const refused = checkMailbox(callerFromHeaders(req.headers), session, agentIdOfSession)
  if (refused) return NextResponse.json(refused.data, { status: refused.status })

  const messages = drainForSession(session)
  return NextResponse.json({ messages, count: messages.length })
}
