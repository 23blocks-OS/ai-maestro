import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { CronExpressionParser } from 'cron-parser'
import type {
  Schedule,
  ScheduleExecution,
  ScheduleCreate,
  ScheduleUpdate,
  SchedulesFile,
  ExecutionStatus,
  ScheduleTrigger,
} from '@/types/schedule'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const SCHEDULES_FILE = path.join(AIMAESTRO_DIR, 'schedules.json')
const MAX_EXECUTIONS_PER_SCHEDULE = 50

function ensureDir() {
  if (!fs.existsSync(AIMAESTRO_DIR)) {
    fs.mkdirSync(AIMAESTRO_DIR, { recursive: true })
  }
}

function loadFile(): SchedulesFile {
  try {
    ensureDir()
    if (!fs.existsSync(SCHEDULES_FILE)) {
      return { version: 1, schedules: [], executions: [] }
    }
    const data = fs.readFileSync(SCHEDULES_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return { version: 1, schedules: [], executions: [] }
  }
}

function saveFile(file: SchedulesFile): void {
  ensureDir()
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(file, null, 2), 'utf-8')
}

function calculateNextRun(cronExpression: string, timezone: string): string | null {
  try {
    const interval = CronExpressionParser.parse(cronExpression, { tz: timezone })
    return interval.next().toISOString()
  } catch {
    return null
  }
}

// --- Schedule CRUD ---

export function listSchedules(): Schedule[] {
  return loadFile().schedules
}

export function listSchedulesByAgent(agentId: string): Schedule[] {
  return loadFile().schedules.filter(s => s.agentId === agentId)
}

export function getSchedule(scheduleId: string): Schedule | null {
  return loadFile().schedules.find(s => s.id === scheduleId) ?? null
}

export function createSchedule(params: ScheduleCreate, agentName: string): Schedule {
  const file = loadFile()
  const now = new Date().toISOString()
  const tz = params.timezone || 'UTC'

  // Validate cron expression
  try {
    CronExpressionParser.parse(params.cronExpression, { tz })
  } catch (e) {
    throw new Error(`Invalid cron expression: ${params.cronExpression}`)
  }

  const schedule: Schedule = {
    id: uuidv4(),
    agentId: params.agentId,
    agentName,
    name: params.name,
    description: params.description,
    cronExpression: params.cronExpression,
    timezone: tz,
    prompt: params.prompt,
    enabled: params.enabled !== false,
    nextRunAt: params.enabled !== false ? calculateNextRun(params.cronExpression, tz) : null,
    lastRunAt: null,
    lastStatus: null,
    consecutiveFailures: 0,
    maxRetries: params.maxRetries ?? 0,
    timeoutMs: params.timeoutMs ?? 300_000,
    createdAt: now,
    updatedAt: now,
  }

  file.schedules.push(schedule)
  saveFile(file)
  return schedule
}

export function updateSchedule(scheduleId: string, params: ScheduleUpdate): Schedule | null {
  const file = loadFile()
  const idx = file.schedules.findIndex(s => s.id === scheduleId)
  if (idx === -1) return null

  const schedule = file.schedules[idx]

  if (params.cronExpression !== undefined) {
    const tz = params.timezone || schedule.timezone
    try {
      CronExpressionParser.parse(params.cronExpression, { tz })
    } catch {
      throw new Error(`Invalid cron expression: ${params.cronExpression}`)
    }
  }

  if (params.name !== undefined) schedule.name = params.name
  if (params.description !== undefined) schedule.description = params.description
  if (params.cronExpression !== undefined) schedule.cronExpression = params.cronExpression
  if (params.timezone !== undefined) schedule.timezone = params.timezone
  if (params.prompt !== undefined) schedule.prompt = params.prompt
  if (params.maxRetries !== undefined) schedule.maxRetries = params.maxRetries
  if (params.timeoutMs !== undefined) schedule.timeoutMs = params.timeoutMs

  if (params.enabled !== undefined) {
    schedule.enabled = params.enabled
    if (params.enabled) {
      schedule.nextRunAt = calculateNextRun(
        params.cronExpression || schedule.cronExpression,
        params.timezone || schedule.timezone
      )
    } else {
      schedule.nextRunAt = null
    }
  } else if (params.cronExpression || params.timezone) {
    schedule.nextRunAt = calculateNextRun(
      params.cronExpression || schedule.cronExpression,
      params.timezone || schedule.timezone
    )
  }

  schedule.updatedAt = new Date().toISOString()
  file.schedules[idx] = schedule
  saveFile(file)
  return schedule
}

export function deleteSchedule(scheduleId: string): boolean {
  const file = loadFile()
  const before = file.schedules.length
  file.schedules = file.schedules.filter(s => s.id !== scheduleId)
  file.executions = file.executions.filter(e => e.scheduleId !== scheduleId)
  if (file.schedules.length === before) return false
  saveFile(file)
  return true
}

export function deleteSchedulesByAgent(agentId: string): number {
  const file = loadFile()
  const before = file.schedules.length
  const removedIds = new Set(file.schedules.filter(s => s.agentId === agentId).map(s => s.id))
  file.schedules = file.schedules.filter(s => s.agentId !== agentId)
  file.executions = file.executions.filter(e => !removedIds.has(e.scheduleId))
  saveFile(file)
  return before - file.schedules.length
}

// --- Execution tracking ---

export function recordExecution(params: {
  scheduleId: string
  agentId: string
  agentName: string
  prompt: string
  triggeredBy: ScheduleTrigger
  sessionExisted: boolean
}): ScheduleExecution {
  const file = loadFile()
  const execution: ScheduleExecution = {
    id: uuidv4(),
    scheduleId: params.scheduleId,
    agentId: params.agentId,
    agentName: params.agentName,
    startedAt: new Date().toISOString(),
    status: 'running',
    prompt: params.prompt,
    triggeredBy: params.triggeredBy,
    sessionExisted: params.sessionExisted,
  }

  file.executions.push(execution)
  pruneExecutions(file)
  saveFile(file)
  return execution
}

export function completeExecution(
  executionId: string,
  status: ExecutionStatus,
  error?: string
): void {
  const file = loadFile()
  const execution = file.executions.find(e => e.id === executionId)
  if (!execution) return

  execution.completedAt = new Date().toISOString()
  execution.status = status
  if (error) execution.error = error

  // Update parent schedule
  const schedule = file.schedules.find(s => s.id === execution.scheduleId)
  if (schedule) {
    schedule.lastRunAt = execution.startedAt
    schedule.lastStatus = status
    schedule.lastError = error
    schedule.updatedAt = new Date().toISOString()

    if (status === 'success') {
      schedule.consecutiveFailures = 0
    } else if (status === 'failure' || status === 'timeout') {
      schedule.consecutiveFailures++
    }

    schedule.nextRunAt = calculateNextRun(schedule.cronExpression, schedule.timezone)
  }

  saveFile(file)
}

export function listExecutions(scheduleId: string, limit = 20): ScheduleExecution[] {
  return loadFile()
    .executions
    .filter(e => e.scheduleId === scheduleId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit)
}

export function listAllExecutions(limit = 50): ScheduleExecution[] {
  return loadFile()
    .executions
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit)
}

// --- Helpers ---

export function getDueSchedules(): Schedule[] {
  const now = new Date().toISOString()
  return loadFile().schedules.filter(s =>
    s.enabled && s.nextRunAt && s.nextRunAt <= now
  )
}

export function advanceNextRun(scheduleId: string): void {
  const file = loadFile()
  const schedule = file.schedules.find(s => s.id === scheduleId)
  if (!schedule) return
  schedule.nextRunAt = calculateNextRun(schedule.cronExpression, schedule.timezone)
  schedule.updatedAt = new Date().toISOString()
  saveFile(file)
}

function pruneExecutions(file: SchedulesFile): void {
  const countBySchedule = new Map<string, number>()
  // Sorted newest first for pruning
  file.executions.sort((a, b) => b.startedAt.localeCompare(a.startedAt))

  file.executions = file.executions.filter(e => {
    const count = countBySchedule.get(e.scheduleId) ?? 0
    if (count >= MAX_EXECUTIONS_PER_SCHEDULE) return false
    countBySchedule.set(e.scheduleId, count + 1)
    return true
  })
}
