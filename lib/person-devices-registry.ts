/**
 * Paired-device registry: one JSON file per device.
 * Storage: ~/.aimaestro/people-devices/{deviceId}.json, on each host the app connects to.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import type { PersonDevice, PushType, DeviceKeyRecord } from '@/types/person-device'

const DIR = path.join(os.homedir(), '.aimaestro', 'people-devices')

export const DEVICE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/
/** A device counts as online when it was seen this recently; the app re-sends the pairing as a heartbeat */
export const ONLINE_WINDOW_MS = 90_000
/** A device not seen this long is forgotten; and at most this many are kept (newest first) */
export const DEVICE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
export const MAX_DEVICES = 500

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

export function loadDevices(now = Date.now()): PersonDevice[] {
  try {
    if (!fs.existsSync(DIR)) return []
    const all = fs.readdirSync(DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.slice(0, -5))
      .filter(isDeviceId)
      .map(read)
      .filter((d): d is PersonDevice => d !== null)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    // Any PUT with a new id adds a file and every needs-you transition reads them all: keep it bounded
    const keep = all.filter((d, i) => i < MAX_DEVICES && now - Date.parse(d.lastSeenAt) < DEVICE_MAX_AGE_MS)
    for (const d of all) if (!keep.includes(d)) fs.rmSync(file(d.deviceId), { force: true })
    return keep
  } catch (error) {
    console.error('Failed to list devices:', error)
    return []
  }
}

export function getDevice(id: string): PersonDevice | null {
  return isDeviceId(id) ? read(id) : null
}

export type DeviceFields = Partial<Pick<PersonDevice, 'personName' | 'deviceName' | 'platform' | 'appVersion'>> & {
  personId: string
  /** null clears the token */
  pushToken?: string | null
  pushTypes?: PushType[]
  /** Raw Ed25519 public key, base64 (already validated by the caller) */
  publicKey?: string
}

/**
 * The key a pairing leaves on the device. Pairing is also the heartbeat and is not authenticated, so a
 * new key, or the device moving to another person, always starts pending until the operator approves
 * it; resending the same key changes nothing; a revoked key stays revoked.
 */
export function keyAfterPairing(existing: PersonDevice | null, personId: string, publicKey: string | undefined, iso: string): DeviceKeyRecord | undefined {
  const old = existing?.key
  if (!publicKey) return existing?.personId === personId ? old : undefined
  if (old && old.publicKey === publicKey && existing?.personId === personId) return old
  return { keyId: `k_${crypto.randomBytes(6).toString('hex')}`, publicKey, status: 'pending', enrolledAt: iso }
}

/** Pair or re-pair a device (also the heartbeat): keeps firstSeenAt, moves the device to the new person if it changed */
export function upsertDevice(id: string, data: DeviceFields, now = new Date()): PersonDevice {
  const existing = getDevice(id)
  const iso = now.toISOString()
  const { publicKey, ...rest } = data
  const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== ''))
  const d: PersonDevice = { ...(existing || {}), ...clean, deviceId: id, personId: data.personId, firstSeenAt: existing?.firstSeenAt || iso, lastSeenAt: iso } as PersonDevice
  if (data.pushToken === null) { delete d.pushToken; delete d.pushTypes }
  const key = keyAfterPairing(existing, data.personId, publicKey, iso)
  if (key) d.key = key
  else delete d.key
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(file(id), JSON.stringify(d, null, 2), 'utf-8')
  return d
}

/**
 * Drop a dead push token without touching lastSeenAt (that would make the device look online).
 * Only when it is still the token that failed: the app may have sent a new one since.
 */
export function clearPushToken(id: string, token: string): void {
  const d = getDevice(id)
  if (!d?.pushToken || d.pushToken !== token) return
  delete d.pushToken
  delete d.pushTypes
  fs.writeFileSync(file(id), JSON.stringify(d, null, 2), 'utf-8')
}

export function removeDevice(id: string): boolean {
  if (!getDevice(id)) return false
  fs.rmSync(file(id), { force: true })
  return true
}

/** Approve (pending → active) or revoke a device's key; only the key the caller names, so a key that changed meanwhile is not touched */
export function setKeyStatus(id: string, keyId: string, status: 'active' | 'revoked', now = new Date()): DeviceKeyRecord | null {
  const d = getDevice(id)
  if (!d?.key || d.key.keyId !== keyId) return null
  if (d.key.status === 'revoked') return status === 'revoked' ? d.key : null
  d.key = status === 'active'
    ? { ...d.key, status: 'active', approvedAt: now.toISOString() }
    : { ...d.key, status: 'revoked', revokedAt: now.toISOString() }
  fs.writeFileSync(file(id), JSON.stringify(d, null, 2), 'utf-8')
  return d.key
}

/** The device key a message's key_id names, with its person, for lib/person-signing */
export function findDeviceKey(keyId: string): { personId: string; deviceId: string; key: DeviceKeyRecord } | null {
  for (const d of loadDevices()) if (d.key?.keyId === keyId) return { personId: d.personId, deviceId: d.deviceId, key: d.key }
  return null
}
