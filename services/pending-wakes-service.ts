/**
 * Operator report for "did that message actually reach the agent?"
 * (GET /api/messages/pending-wakes). Logic moved out of the Next route so the
 * headless router serves the same function (B012).
 *
 * Every pending row is a message that IS on disk in the recipient's inbox but
 * that no wake route has proved the agent saw. `reason` is `busy` (never
 * attempted; pane mid-render) or `unconfirmed` (attempted, nothing proved it landed).
 */

import { pendingWakes, totalPendingWakes } from '@/lib/wake-queue'
import { hookStatus } from '@/services/shared-state'
import { isSessionIdle, idleSource, detectStartupBlock } from '@/lib/session-idle'
import { getRuntime } from '@/lib/agent-runtime'
import type { ServiceResult } from '@/services/service-errors'

export async function getPendingWakesReport(): Promise<ServiceResult<any>> {
  const pending = pendingWakes()

  // Which agents we currently have a real busy/idle signal for. `source: 'none'`
  // is the blind spot: no hook report and no attached terminal.
  const now = Date.now()
  const idleSignals = Array.from(hookStatus.entries()).map(([sessionName, s]) => ({
    sessionName,
    status: s.status,
    notificationType: s.notificationType,
    ageMs: now - s.at,
    idle: isSessionIdle(sessionName),
    source: idleSource(sessionName),
  }))

  // Sessions wedged on a startup prompt never fire a hook, so they look healthy elsewhere.
  const blocked: Array<{ sessionName: string; blockedBy: string }> = []
  try {
    const runtime = getRuntime()
    for (const s of await runtime.listSessions()) {
      if (hookStatus?.has(s.name)) continue // already past startup
      const b = await detectStartupBlock(s.name, (n, l) => runtime.capturePane(n, l))
      if (b) blocked.push({ sessionName: s.name, blockedBy: b })
    }
  } catch {
    // Never fail the whole report because one pane could not be captured.
  }

  return {
    data: {
      blockedSessions: blocked,
      total: totalPendingWakes(),
      busy: pending.filter((p) => p.reason === 'busy').length,
      unconfirmed: pending.filter((p) => p.reason === 'unconfirmed').length,
      pending,
      idleSignals,
    },
    status: 200,
  }
}
