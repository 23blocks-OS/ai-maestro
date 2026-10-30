/**
 * Paired-device registry: one JSON file per device.
 * Storage: ~/.aimaestro/people-devices/{deviceId}.json, on each host the app connects to.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import type { PersonDevice } from '@/types/person-device'

const DIR = path.join(os.homedir(), '.aimaestro', 'people-devices')

export const DEVICE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/
/** A device counts as online when it was seen this recently; the app re-sends the pairing as a heartbeat */
export const ONLINE_WINDOW_MS = 90_000

export function isDeviceId(id: unknown): id is string {
  return typeof id === 'string' && DEVICE_ID.test(id)
}

function file(id: string): string {
  if (!isDeviceId(id)) throw new Error('Invalid device id')
  return path.join(DIR, `${id}.json`)
}

function read(id: string): PersonDevice | null {
  try {
    const f = file(id)
    if (!fs.existsSync(f)) return null
    const d = JSON.parse(fs.readFileSync(f, 'utf-8'))
    if (!d || typeof d !== 'object' || typeof d.personId !== 'string') return null
    return { ...d, deviceId: id }
  } catch (error) {
    console.error(`Failed to read device ${id}:`, error)
    return null
  }
}

export function loadDevices(): PersonDevice[] {
  try {
    if (!fs.existsSync(DIR)) return []
    return fs.readdirSync(DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.slice(0, -5))
      .filter(isDeviceId)
      .map(read)
      .filter((d): d is PersonDevice => d !== null)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
  } catch (error) {
    console.error('Failed to list devices:', error)
    return []
  }
}

export function getDevice(id: string): PersonDevice | null {
  return isDeviceId(id) ? read(id) : null
}

export type DeviceFields = Partial<Pick<PersonDevice, 'personName' | 'deviceName' | 'platform' | 'appVersion'>> & { personId: string }

/** Pair or re-pair a device (also the heartbeat): keeps firstSeenAt, moves the device to the new person if it changed */
export function upsertDevice(id: string, data: DeviceFields, now = new Date()): PersonDevice {
  const existing = getDevice(id)
  const iso = now.toISOString()
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== ''))
  const d: PersonDevice = { ...(existing || {}), ...clean, deviceId: id, personId: data.personId, firstSeenAt: existing?.firstSeenAt || iso, lastSeenAt: iso } as PersonDevice
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(file(id), JSON.stringify(d, null, 2), 'utf-8')
  return d
}

export function removeDevice(id: string): boolean {
  if (!getDevice(id)) return false
  fs.rmSync(file(id), { force: true })
  return true
}
