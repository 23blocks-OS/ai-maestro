/**
 * GET /api/messages/pending-wakes
 *
 * Operator surface for "did that message actually reach the agent?".
 *
 * Every row is a message that IS on disk in the recipient's inbox but that no
 * wake route has proved the agent saw. Before this existed the state was
 * invisible: delivery reported success, the notification was eaten by a busy
 * pane or dropped by an unregistered channel, and nothing anywhere said so.
 *
 * `reason` distinguishes the two ways a wake ends up here:
 *   busy        — never attempted; the pane was mid-render when it arrived
 *   unconfirmed — attempted, and nothing could prove it landed
 *
 * MUST stay force-dynamic. This handler reads only in-memory maps and calls no
 * dynamic API, so Next happily evaluates it at BUILD time and serves a frozen
 * snapshot of empty maps — an endpoint whose entire job is reporting live state
 * would report zeros forever.
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { pendingWakes, totalPendingWakes } from '@/lib/wake-queue'
import { hookStatus } from '@/services/shared-state'
import { isSessionIdle, idleSource, detectStartupBlock } from '@/lib/session-idle'
import { getRuntime } from '@/lib/agent-runtime'

export async function GET() {
  const pending = pendingWakes()

  // Which agents we currently have a real busy/idle signal for. `source: 'none'`
  // is the blind spot: no hook report and no attached terminal, so the pane
  // route cannot tell a working agent from a waiting one.
  const now = Date.now()
  const idleSignals = Array.from(hookStatus.entries()).map(([sessionName, s]) => ({
    sessionName,
    status: s.status,
    notificationType: s.notificationType,
    ageMs: now - s.at,
    idle: isSessionIdle(sessionName),
    source: idleSource(sessionName),
  }))

  // Sessions wedged on a startup prompt (e.g. "Do you trust the files in this
  // folder?"). These never fire a hook, so they look healthy everywhere else.
  const runtime = getRuntime()
  const blocked: Array<{ sessionName: string; blockedBy: string }> = []
  try {
    for (const s of await runtime.listSessions()) {
      if (hookStatus?.has(s.name)) continue // already past startup
      const b = await detectStartupBlock(s.name, (n, l) => runtime.capturePane(n, l))
      if (b) blocked.push({ sessionName: s.name, blockedBy: b })
    }
  } catch {
    // Never fail the whole report because one pane could not be captured.
  }

  return NextResponse.json({
    blockedSessions: blocked,
    total: totalPendingWakes(),
    busy: pending.filter((p) => p.reason === 'busy').length,
    unconfirmed: pending.filter((p) => p.reason === 'unconfirmed').length,
    pending,
    idleSignals,
  })
}
