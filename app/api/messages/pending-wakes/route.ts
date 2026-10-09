/**
 * GET /api/messages/pending-wakes
 *
 * Operator surface for "did that message actually reach the agent?". The report
 * is built by services/pending-wakes-service.ts (shared with the headless router).
 *
 * MUST stay force-dynamic. The handler reads only in-memory maps and calls no
 * dynamic API, so Next happily evaluates it at BUILD time and serves a frozen
 * snapshot of empty maps — an endpoint whose entire job is reporting live state
 * would report zeros forever.
 */
export const dynamic = 'force-dynamic'

import { getPendingWakesReport } from '@/services/pending-wakes-service'
import { toResponse } from '@/app/api/_helpers'

export async function GET() {
  return toResponse(await getPendingWakesReport())
}
