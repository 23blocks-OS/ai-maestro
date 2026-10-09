/**
 * GET  /api/agents/[id]/schedule — the agent's own scheduled tasks
 * POST /api/agents/[id]/schedule — replace them, or { "run": true } to run due tasks now
 *
 * The schedule is agent-owned state in ~/.aimaestro/agents/<id>/schedule.json,
 * so it travels with the agent to another machine. See lib/agent-schedule.ts.
 * Logic in services/agent-own-schedule-service.ts (shared with the headless router).
 *
 * Reads live state — must stay dynamic, or Next serves a build-time snapshot.
 */

import { NextRequest } from 'next/server'
import { getOwnSchedule, setOwnSchedule } from '@/services/agent-own-schedule-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(getOwnSchedule(id))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  return toResponse(await setOwnSchedule(id, body))
}
