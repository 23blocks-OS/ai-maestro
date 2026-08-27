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
 */

import { NextResponse } from 'next/server'
import { pendingWakes, totalPendingWakes } from '@/lib/wake-queue'

export async function GET() {
  const pending = pendingWakes()
  return NextResponse.json({
    total: totalPendingWakes(),
    busy: pending.filter((p) => p.reason === 'busy').length,
    unconfirmed: pending.filter((p) => p.reason === 'unconfirmed').length,
    pending,
  })
}
