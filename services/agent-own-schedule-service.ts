/**
 * An agent's OWN scheduled tasks (agent-owned state in
 * ~/.aimaestro/agents/<id>/schedule.json, see lib/agent-schedule.ts).
 *
 * Not to be confused with services/agents-schedule-service.ts (the host-level
 * cron-like schedules under /api/schedules). Logic moved here from the Next route
 * so the headless router serves the same functions (B012).
 */

import { readSchedule, writeSchedule, dueTasks, describeCadence } from '@/lib/agent-schedule'
import type { ServiceResult } from '@/services/service-errors'
import { unknownAgentResult } from '@/services/agent-guard'

export function getOwnSchedule(agentId: string): ServiceResult<any> {
  // B010: an unsafe or unknown id answers 404 and creates nothing (isKnownAgentId rejects unsafe ids)
  const unknown = unknownAgentResult(agentId)
  if (unknown) return unknown
  const schedule = readSchedule(agentId)
  return {
    data: {
      success: true,
      ...schedule,
      tasks: schedule.tasks.map((t) => ({ ...t, cadence: describeCadence(t) })),
      dueNow: dueTasks(schedule).map((t) => t.id),
    },
    status: 200,
  }
}

/** Replace the schedule (`{ tasks: [...] }`) or run the due tasks now (`{ run: true }`). */
export async function setOwnSchedule(agentId: string, rawBody: unknown): Promise<ServiceResult<any>> {
  try {
    // B010: an unsafe or unknown id answers 404 and creates nothing (also for { run: true })
    const unknown = unknownAgentResult(agentId)
    if (unknown) return unknown
    const body: any = rawBody && typeof rawBody === 'object' ? rawBody : {}

    if (body.run === true) {
      const { runDueTasks } = await import('@/lib/agent-schedule-runner')
      return { data: { success: true, ...(await runDueTasks(agentId)) }, status: 200 }
    }

    if (!Array.isArray(body.tasks)) {
      return { data: { success: false, error: 'expected { tasks: [...] } or { run: true }' } as any, status: 400 }
    }

    const ok = writeSchedule({ version: 1, agentId, tasks: body.tasks })
    return { data: { success: ok, ...readSchedule(agentId) }, status: ok ? 200 : 500 }
  } catch (error) {
    return { data: { success: false, error: error instanceof Error ? error.message : 'Unknown error' } as any, status: 500 }
  }
}
