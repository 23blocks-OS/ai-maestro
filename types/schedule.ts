export type ScheduleTrigger = 'cron' | 'manual' | 'webhook'
export type ExecutionStatus = 'pending' | 'running' | 'success' | 'failure' | 'timeout' | 'skipped'

export interface Schedule {
  id: string
  agentId: string
  agentName: string
  name: string
  description?: string
  cronExpression: string
  timezone: string
  prompt: string
  enabled: boolean
  nextRunAt: string | null
  lastRunAt: string | null
  lastStatus: ExecutionStatus | null
  lastError?: string
  consecutiveFailures: number
  maxRetries: number
  timeoutMs: number
  createdAt: string
  updatedAt: string
}

export interface ScheduleExecution {
  id: string
  scheduleId: string
  agentId: string
  agentName: string
  startedAt: string
  completedAt?: string
  status: ExecutionStatus
  prompt: string
  error?: string
  triggeredBy: ScheduleTrigger
  sessionExisted: boolean
}

export interface ScheduleCreate {
  agentId: string
  name: string
  description?: string
  cronExpression: string
  timezone?: string
  prompt: string
  enabled?: boolean
  maxRetries?: number
  timeoutMs?: number
}

export interface ScheduleUpdate {
  name?: string
  description?: string
  cronExpression?: string
  timezone?: string
  prompt?: string
  enabled?: boolean
  maxRetries?: number
  timeoutMs?: number
}

export interface SchedulesFile {
  version: number
  schedules: Schedule[]
  executions: ScheduleExecution[]
}
