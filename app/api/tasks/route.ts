/**
 * GET /api/tasks — every open card on this host, across its agents and teams
 * (?quadrant=q1|q2|q3|q4|unplaced, ?waitingOn=juan, ?agent=<id or name>).
 * The mesh-wide Matrix fans out over every host's answer to this.
 */

import { NextRequest } from 'next/server'
import { getOpenTasks } from '@/services/agent-tasks-service'
import { toResponse } from '@/app/api/_helpers'

// Reads files that change: never prerendered
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  return toResponse(getOpenTasks({
    quadrant: url.searchParams.get('quadrant') || undefined,
    waitingOn: url.searchParams.get('waitingOn') || undefined,
    agent: url.searchParams.get('agent') || undefined,
  }))
}
