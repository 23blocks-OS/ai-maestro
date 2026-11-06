import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import {
  type ServiceResult,
  invalidField,
  operationFailed,
  notFound
} from './service-errors'

export interface AgentHome {
  name: string
  key: string
  assignedAgent: string
  state: 'online' | 'offline' | 'revoked' | 'connecting'
  checkedAt: string
  lastSeen: string | null
  platform?: string
  capabilities: string[]
  streams: string[]
  permissions: Record<string, boolean>
}
export type HomeChange =
  | { action: 'transfer'; agent: string; key: string }
  | { action: 'camera'; enabled: boolean }
  | { action: 'revoke' }
export interface HomeRequest {
  id: string
  agent: string
  device: string
  deviceKey: string
  change: HomeChange
  createdAt: number
  status?: string
}
const directory = () =>
  process.env.ADP_DASHBOARD_DIR ||
  path.join(os.homedir(), '.aimaestro', 'device-homes')
const address = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 254 &&
  /^[A-Za-z0-9][A-Za-z0-9._+-]*@[A-Za-z0-9][A-Za-z0-9.-]*$/.test(value) &&
  !/\s/.test(value)
const key = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[A-Za-z0-9_-]{43}$/.test(value) &&
  Buffer.from(value, 'base64url').toString('base64url') === value
function readJson(file: string) {
  const stat = fs.lstatSync(file)
  if (!stat.isFile() || stat.size > 1024 * 1024)
    throw new Error('Invalid monitor file')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}
function files(subdir: string): string[] {
  try {
    return fs
      .readdirSync(path.join(directory(), subdir))
      .filter((f) => /^[a-f0-9]+\.json$/.test(f))
      .slice(0, 100)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}
export function listAgentHomes(): ServiceResult<{
  devices: AgentHome[]
  requests: HomeRequest[]
}> {
  try {
    const devices: AgentHome[] = []
    const acknowledgements: Record<string, { status: string }> = {}
    for (const file of files('status')) {
      let report
      try {
        report = readJson(path.join(directory(), 'status', file))
      } catch {
        continue
      }
      if (!address(report.agent) || !report.devices) continue
      for (const record of Object.values(report.devices) as AgentHome[]) {
        if (
          !key(record?.key) ||
          record.assignedAgent !== report.agent ||
          typeof record.name !== 'string' ||
          !Number.isFinite(Date.parse(record.checkedAt))
        )
          continue
        const age = Date.now() - Date.parse(record.checkedAt)
        const fresh = age >= -5000 && age < 90000
        devices.push({
          name: record.name,
          key: record.key,
          assignedAgent: record.assignedAgent,
          state:
            fresh && ['online', 'revoked', 'connecting'].includes(record.state)
              ? record.state
              : 'offline',
          checkedAt: record.checkedAt,
          lastSeen: record.lastSeen ?? null,
          platform: record.platform,
          capabilities: Array.isArray(record.capabilities)
            ? record.capabilities.filter((x: unknown) => typeof x === 'string')
            : [],
          streams: Array.isArray(record.streams)
            ? record.streams.filter((x: unknown) => typeof x === 'string')
            : [],
          permissions: Object.fromEntries(
            Object.entries(record.permissions ?? {}).filter(
              ([, value]) => typeof value === 'boolean'
            )
          ) as Record<string, boolean>
        })
      }
      for (const [id, acknowledgement] of Object.entries(
        report.requests ?? {}
      )) {
        const status = (acknowledgement as { status?: string })?.status
        if (typeof status === 'string') acknowledgements[id] = { status }
      }
    }
    // A live verified observation takes precedence over a former controller's rejected poll.
    devices.sort(
      (a, b) =>
        Number(a.state === 'online') - Number(b.state === 'online') ||
        Date.parse(a.checkedAt) - Date.parse(b.checkedAt)
    )
    const unique = [...new Map(devices.map((d) => [d.key, d])).values()]
    const requests: HomeRequest[] = []
    for (const file of files('requests')) {
      let request
      try {
        request = readJson(path.join(directory(), 'requests', file))
      } catch {
        continue
      }
      if (
        request.id + '.json' !== file ||
        !address(request.agent) ||
        !key(request.deviceKey) ||
        !Number.isFinite(request.createdAt) ||
        !validChange(request.change)
      )
        continue
      const confirmed = unique.find(
        (d) =>
          d.key === request.deviceKey &&
          d.state === 'online' &&
          Date.parse(d.checkedAt) > request.createdAt
      )
      let status = acknowledgements[request.id]?.status || 'queued'
      if (
        request.change.action === 'transfer' &&
        confirmed?.assignedAgent === request.change.agent
      )
        status = 'confirmed'
      if (
        request.change.action === 'camera' &&
        confirmed &&
        confirmed.assignedAgent === request.agent &&
        confirmed.permissions.camera === request.change.enabled
      )
        status = 'confirmed'
      if (
        Date.now() - request.createdAt > 300000 &&
        !['confirmed', 'rejected'].includes(status)
      )
        status = 'expired'
      requests.push({ ...request, status })
    }
    return { status: 200, data: { devices: unique, requests } }
  } catch (error) {
    return operationFailed('read agent homes', (error as Error).message)
  }
}
function validChange(value: unknown): value is HomeChange {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (v.action === 'transfer')
    return (
      address(v.agent) &&
      key(v.key) &&
      Object.keys(v).every((k) => ['action', 'agent', 'key'].includes(k))
    )
  if (v.action === 'camera')
    return (
      typeof v.enabled === 'boolean' &&
      Object.keys(v).every((k) => ['action', 'enabled'].includes(k))
    )
  return v.action === 'revoke' && Object.keys(v).length === 1
}
export function requestHomeChange(
  params: Record<string, unknown>
): ServiceResult<{ request: HomeRequest; status: string }> {
  if (
    !key(params.deviceKey) ||
    !address(params.agent) ||
    !validChange(params.change)
  )
    return invalidField(
      'change',
      'Choose a device and a valid ownership or camera change'
    )
  const listed = listAgentHomes()
  if (!listed.data || !('devices' in listed.data))
    return { status: listed.status, data: listed.data }
  const device = listed.data.devices.find(
    (d) => d.key === params.deviceKey && d.assignedAgent === params.agent
  )
  if (!device) return notFound('Agent home', String(params.deviceKey))
  if (
    listed.data.requests.some(
      (r) =>
        r.deviceKey === device.key &&
        ['queued', 'awaiting_local_approval'].includes(r.status ?? '')
    )
  )
    return invalidField('deviceKey', 'A change already awaits local approval')
  try {
    const request: HomeRequest = {
      id: crypto.randomBytes(24).toString('hex'),
      agent: device.assignedAgent,
      device: device.name,
      deviceKey: device.key,
      change: params.change,
      createdAt: Date.now()
    }
    const dir = path.join(directory(), 'requests')
    fs.mkdirSync(dir, { recursive: true, mode: 0o770 })
    fs.writeFileSync(
      path.join(dir, request.id + '.json'),
      JSON.stringify(request),
      { mode: 0o660, flag: 'wx' }
    )
    return { status: 202, data: { request, status: 'queued' } }
  } catch (error) {
    return operationFailed('request device change', (error as Error).message)
  }
}
