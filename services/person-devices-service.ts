/**
 * Person Devices Service
 *
 * An app tells a host "this device is person X" (PUT, repeated as a heartbeat). The host lists its
 * devices with an online flag. A person is online when any host has a recently seen device for them;
 * the People page asks every host. Routes are thin wrappers.
 */

import { loadDevices, getDevice, upsertDevice, removeDevice, isDeviceId, ONLINE_WINDOW_MS } from '@/lib/person-devices-registry'
import { isPersonId } from '@/lib/people-registry'
import { getSelfHostId } from '@/lib/hosts-config'
import { type ServiceResult, notFound, invalidField, missingField, operationFailed } from '@/services/service-errors'
import { PUSH_TYPES, type PersonDevice, type PersonDeviceRecord, type PushType } from '@/types/person-device'

const MAX_TEXT = 80

/** What Expo issues: ExponentPushToken[...] or ExpoPushToken[...] */
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,128}\]$/

const record = (d: PersonDevice, now = Date.now()): PersonDeviceRecord => ({
  ...(({ pushToken: _t, ...rest }) => rest)(d),
  pushEnabled: !!d.pushToken && !!d.pushTypes?.length,
  hostId: getSelfHostId(),
  online: now - new Date(d.lastSeenAt).getTime() <= ONLINE_WINDOW_MS,
})

export function listDevices(opts: { personId?: string | null } = {}): ServiceResult<{ devices: PersonDeviceRecord[] }> {
  const all = loadDevices().filter(d => !opts.personId || d.personId === opts.personId)
  return { data: { devices: all.map(d => record(d)) }, status: 200 }
}

export function pairDevice(deviceId: string, params: Record<string, unknown>): ServiceResult<{ device: PersonDeviceRecord }> {
  if (!isDeviceId(deviceId)) return invalidField('deviceId', 'deviceId must be 8 to 64 letters, digits, hyphens or underscores')
  if (params.personId === undefined || params.personId === '') return missingField('personId')
  if (!isPersonId(params.personId)) return invalidField('personId', 'personId must be an id from GET /api/people')
  const text: Record<string, string> = {}
  for (const k of ['personName', 'deviceName', 'platform', 'appVersion']) {
    if (params[k] === undefined) continue
    if (typeof params[k] !== 'string' || (params[k] as string).length > MAX_TEXT) return invalidField(k, `${k} must be text of at most ${MAX_TEXT} characters`)
    text[k] = (params[k] as string).trim()
  }
  // pushToken null (or pushTypes []) clears; absent leaves what is stored, so a heartbeat without them changes nothing
  const push: { pushToken?: string | null; pushTypes?: PushType[] } = {}
  if (params.pushToken !== undefined) {
    if (params.pushToken !== null && (typeof params.pushToken !== 'string' || !EXPO_TOKEN.test(params.pushToken))) return invalidField('pushToken', 'pushToken must be an Expo push token or null')
    push.pushToken = params.pushToken as string | null
  }
  if (params.pushTypes !== undefined) {
    if (!Array.isArray(params.pushTypes) || !params.pushTypes.every(t => (PUSH_TYPES as readonly unknown[]).includes(t))) return invalidField('pushTypes', `pushTypes must list only: ${PUSH_TYPES.join(', ')}`)
    push.pushTypes = [...new Set(params.pushTypes as PushType[])]
  }
  if (push.pushTypes && !push.pushTypes.length) push.pushToken = null
  try {
    return { data: { device: record(upsertDevice(deviceId, { personId: params.personId, ...text, ...push })) }, status: 200 }
  } catch (error) {
    return operationFailed('pair device', (error as Error).message)
  }
}

export function unpairDevice(deviceId: string): ServiceResult<{ success: boolean }> {
  if (!isDeviceId(deviceId) || !getDevice(deviceId)) return notFound('Device', deviceId)
  return removeDevice(deviceId) ? { data: { success: true }, status: 200 } : notFound('Device', deviceId)
}
