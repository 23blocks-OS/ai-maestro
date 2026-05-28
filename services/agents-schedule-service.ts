import {
  listSchedules,
  listSchedulesByAgent,
  getSchedule,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  deleteSchedulesByAgent,
  listExecutions,
  listAllExecutions,
} from '@/lib/schedule-registry'
import { getAgent } from '@/lib/agent-registry'
import { executeSchedule } from '@/lib/schedule-executor'
import {
  type ServiceResult,
  ok,
  notFound,
  missingField,
  invalidField,
  operationFailed,
} from '@/services/service-errors'
import type { Schedule, ScheduleCreate, ScheduleUpdate, ScheduleExecution } from '@/types/schedule'

export function getAgentSchedules(agentId: string): ServiceResult<{ schedules: Schedule[] }> {
  const agent = getAgent(agentId)
  if (!agent) return notFound('Agent', agentId)
  return ok({ schedules: listSchedulesByAgent(agentId) })
}

export function getAllSchedules(): ServiceResult<{ schedules: Schedule[] }> {
  return ok({ schedules: listSchedules() })
}

export function getScheduleById(scheduleId: string): ServiceResult<{ schedule: Schedule }> {
  const schedule = getSchedule(scheduleId)
  if (!schedule) return notFound('Schedule', scheduleId)
  return ok({ schedule })
}

export function createAgentSchedule(
  agentId: string,
  body: Partial<ScheduleCreate>
): ServiceResult<{ schedule: Schedule }> {
  const agent = getAgent(agentId)
  if (!agent) return notFound('Agent', agentId)

  if (!body.name) return missingField('name')
  if (!body.cronExpression) return missingField('cronExpression')
  if (!body.prompt) return missingField('prompt')

  try {
    const schedule = createSchedule(
      { ...body, agentId, name: body.name, cronExpression: body.cronExpression, prompt: body.prompt },
      agent.name
    )
    console.log(`[Scheduler] Created schedule "${schedule.name}" for agent ${agent.name} (cron: ${schedule.cronExpression})`)
    return ok({ schedule }, 201)
  } catch (error) {
    return invalidField('cronExpression', (error as Error).message)
  }
}

export function updateAgentSchedule(
  scheduleId: string,
  body: ScheduleUpdate
): ServiceResult<{ schedule: Schedule }> {
  const existing = getSchedule(scheduleId)
  if (!existing) return notFound('Schedule', scheduleId)

  try {
    const updated = updateSchedule(scheduleId, body)
    if (!updated) return notFound('Schedule', scheduleId)
    console.log(`[Scheduler] Updated schedule "${updated.name}" (enabled=${updated.enabled})`)
    return ok({ schedule: updated })
  } catch (error) {
    return invalidField('cronExpression', (error as Error).message)
  }
}

export function deleteAgentSchedule(scheduleId: string): ServiceResult<{ success: boolean }> {
  const existing = getSchedule(scheduleId)
  if (!existing) return notFound('Schedule', scheduleId)

  deleteSchedule(scheduleId)
  console.log(`[Scheduler] Deleted schedule "${existing.name}" for agent ${existing.agentName}`)
  return ok({ success: true })
}

export function deleteAllAgentSchedules(agentId: string): ServiceResult<{ deleted: number }> {
  const count = deleteSchedulesByAgent(agentId)
  return ok({ deleted: count })
}

export async function triggerSchedule(
  scheduleId: string,
  triggeredBy: 'manual' | 'webhook' = 'manual'
): Promise<ServiceResult<{ executionId: string; status: string }>> {
  const schedule = getSchedule(scheduleId)
  if (!schedule) return notFound('Schedule', scheduleId)

  try {
    const result = await executeSchedule(schedule, triggeredBy)
    return ok(result)
  } catch (error) {
    return operationFailed('trigger schedule', (error as Error).message)
  }
}

export function getScheduleExecutions(
  scheduleId: string,
  limit = 20
): ServiceResult<{ executions: ScheduleExecution[] }> {
  const schedule = getSchedule(scheduleId)
  if (!schedule) return notFound('Schedule', scheduleId)
  return ok({ executions: listExecutions(scheduleId, limit) })
}

export function getAllExecutions(limit = 50): ServiceResult<{ executions: ScheduleExecution[] }> {
  return ok({ executions: listAllExecutions(limit) })
}
