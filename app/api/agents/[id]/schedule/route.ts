/**
 * GET  /api/agents/[id]/schedule — the agent's own scheduled tasks
 * POST /api/agents/[id]/schedule — replace them, or { "run": true } to run due tasks now
 *
 * The schedule is agent-owned state in ~/.aimaestro/agents/<id>/schedule.json,
 * so it travels with the agent to another machine. See lib/agent-schedule.ts.
 *
 * Reads live state — must stay dynamic, or Next serves a build-time snapshot.
 */

import { NextRequest, NextResponse } from 'next/server'
import { readSchedule, writeSchedule, dueTasks, describeCadence } from '@/lib/agent-schedule'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const schedule = readSchedule(id)
  return NextResponse.json({
    success: true,
    ...schedule,
    tasks: schedule.tasks.map((t) => ({ ...t, cadence: describeCadence(t) })),
    dueNow: dueTasks(schedule).map((t) => t.id),
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    if (body.run === true) {
      const { runDueTasks } = await import('@/lib/agent-schedule-runner')
      return NextResponse.json({ success: true, ...(await runDueTasks(id)) })
    }

    if (!Array.isArray(body.tasks)) {
      return NextResponse.json(
        { success: false, error: 'expected { tasks: [...] } or { run: true }' },
        { status: 400 }
      )
    }

    const ok = writeSchedule({ version: 1, agentId: id, tasks: body.tasks })
    return NextResponse.json({ success: ok, ...readSchedule(id) }, { status: ok ? 200 : 500 })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
