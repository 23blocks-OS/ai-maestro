/**
 * Push to a person's phone through Expo's push service.
 *
 * AI Maestro runs no server of its own for this: the host sends one HTTPS POST to Expo with the
 * phone's token, and Expo delivers through Apple/Google with the app owner's key, which never
 * sits on a host. A host without internet sends nothing and says so in the log; the app keeps
 * working as before.
 *
 * What is sent is deliberately thin: the agent's name and a fixed sentence. Never command text,
 * file paths, message bodies or card text. The app opens the right screen from `data`.
 */

import { loadDevices, clearPushToken } from '@/lib/person-devices-registry'
import { getAgent } from '@/lib/agent-registry'
import { getSelfHostId } from '@/lib/hosts-config'
import { getPerson } from '@/lib/people-registry'
import type { PersonDevice, PushType } from '@/types/person-device'

const SEND_URL = 'https://exp.host/--/api/v2/push/send'
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
const BATCH = 100 // Expo's limit per request
const TIMEOUT_MS = 10_000
const RECEIPT_DELAY_MS = 15 * 60_000 // Expo asks for receipts no sooner than this
/** One push per agent per type in this window, so a flapping agent does not buzz the phone */
export const COOLDOWN_MS = 60_000
/** One ring per callee in this window, so a loop of call starts does not ring the phone non-stop */
export const CALL_COOLDOWN_MS = 15_000
const RECEIPTS_BATCH = 1_000 // Expo's limit per receipts request

interface PendingReceipt { id: string; deviceId: string; token: string }
const g = globalThis as unknown as {
  _pushLastSent?: Map<string, number>
  _pushOfflineLogged?: boolean
  _pushReceipts?: { pending: PendingReceipt[]; timer: ReturnType<typeof setTimeout> | null }
}
const lastSent = (g._pushLastSent ||= new Map<string, number>())
const receipts = (g._pushReceipts ||= { pending: [], timer: null })

/** True (and records the send) when `key` has not been sent within `windowMs`. Old keys are dropped. */
function claimSlot(key: string, windowMs: number, now = Date.now()): boolean {
  for (const [k, at] of lastSent) if (now - at >= Math.max(COOLDOWN_MS, CALL_COOLDOWN_MS)) lastSent.delete(k)
  if (now - (lastSent.get(key) ?? -Infinity) < windowMs) return false
  lastSent.set(key, now)
  return true
}

interface ExpoMessage {
  to: string
  title: string
  body: string
  data: { type: PushType; agentId?: string; callId?: string; hostId: string }
  channelId: string
  /** Seconds Expo keeps trying to deliver; a call that has stopped ringing is not worth delivering */
  ttl?: number
  priority: 'high'
  sound: 'default'
  interruptionLevel?: 'time-sensitive'
}

interface Ticket { status: 'ok' | 'error'; id?: string; details?: { error?: string } }

async function post(url: string, body: unknown): Promise<{ data?: unknown } | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) { console.log(`[Push] Expo answered ${res.status}; nothing sent`); return null }
    g._pushOfflineLogged = false // reachable again: log the next outage too
    return await res.json()
  } catch (error) {
    // No internet, DNS, timeout: skip quietly (one line, once), the app keeps working without push
    if (!g._pushOfflineLogged) { g._pushOfflineLogged = true; console.log(`[Push] Expo unreachable (${(error as Error).message}); push skipped`) }
    return null
  }
}

const dead = (t: Ticket) => t.status === 'error' && t.details?.error === 'DeviceNotRegistered'

/**
 * Receipts report failures that tickets cannot (the token was fine when Expo took it, then
 * Apple/Google refused). One queue and one timer for every send, flushed in batches.
 */
function checkReceiptsLater(ids: PendingReceipt[]) {
  if (!ids.length) return
  receipts.pending.push(...ids)
  if (receipts.timer) return
  receipts.timer = setTimeout(async () => {
    receipts.timer = null
    const due = receipts.pending.splice(0)
    for (let i = 0; i < due.length; i += RECEIPTS_BATCH) {
      const chunk = due.slice(i, i + RECEIPTS_BATCH)
      const res = await post(RECEIPTS_URL, { ids: chunk.map(r => r.id) })
      const got = (res?.data || {}) as Record<string, Ticket>
      for (const r of chunk) if (got[r.id] && dead(got[r.id])) clearPushToken(r.deviceId, r.token)
    }
  }, RECEIPT_DELAY_MS)
  receipts.timer.unref()
}

/** Send one message per device to Expo, drop dead tokens. No retries. */
async function deliver(targets: PersonDevice[], make: (to: string) => ExpoMessage): Promise<void> {
  for (let i = 0; i < targets.length; i += BATCH) {
    const chunk = targets.slice(i, i + BATCH)
    const res = await post(SEND_URL, chunk.map(d => make(d.pushToken!)))
    const tickets = Array.isArray(res?.data) ? (res!.data as Ticket[]) : []
    const pending: PendingReceipt[] = []
    tickets.forEach((t, n) => {
      // Clear only the token we sent to: the app may have registered a new one meanwhile
      if (dead(t)) clearPushToken(chunk[n].deviceId, chunk[n].pushToken!)
      else if (t.status === 'ok' && t.id) pending.push({ id: t.id, deviceId: chunk[n].deviceId, token: chunk[n].pushToken! })
    })
    checkReceiptsLater(pending)
  }
}

/** An agent started waiting on a person. Notifies every paired device that opted in to `needs_you`. */
export async function pushNeedsYou(agentId?: string, sessionName?: string): Promise<void> {
  // The cooldown first: it is in memory, the device list is files
  if (!claimSlot(`needs_you:${agentId || sessionName}`, COOLDOWN_MS)) return
  const targets = loadDevices().filter(d => d.pushToken && d.pushTypes?.includes('needs_you'))
  if (!targets.length) return
  const name = (agentId && agentHeading(getAgent(agentId))) || sessionName || 'An agent'
  const hostId = getSelfHostId()
  await deliver(targets, to => ({
    to,
    title: `${name} needs you`,
    body: 'Open AI Maestro to respond.',
    data: { type: 'needs_you', agentId, hostId },
    channelId: 'needs_you',
    priority: 'high',
    sound: 'default',
    interruptionLevel: 'time-sensitive',
  }))
}

/** "George (AI Maestro product owner)": the name people know the agent by (its label), then its title */
export function agentHeading(agent: { label?: string; name?: string; title?: string } | null | undefined): string | null {
  const name = agent?.label?.trim() || agent?.name?.trim()
  if (!name) return null
  const title = agent?.title?.trim()
  return title ? `${name} (${title})` : name
}

/** "person:<id>" → the person id; anything else (an agent, an address) is not a paired phone */
const personOf = (party: string) => party.startsWith('person:') ? party.slice('person:'.length) : null

/** A call started: ring the callee's paired phones that opted in to `call`. Only people have phones. */
export async function pushCall(call: { callId: string; caller: string; callee: string; expiresAt: string }): Promise<void> {
  const personId = personOf(call.callee)
  if (!personId) return
  if (!claimSlot(`call:${personId}`, CALL_COOLDOWN_MS)) return
  const targets = loadDevices().filter(d => d.personId === personId && d.pushToken && d.pushTypes?.includes('call'))
  if (!targets.length) return
  const ttl = Math.floor((Date.parse(call.expiresAt) - Date.now()) / 1000)
  if (ttl < 1) return
  // Only names this host knows: the caller string is chosen by whoever starts the call
  const callerName = (call.caller.startsWith('agent:') && agentHeading(getAgent(call.caller.slice(6)))) ||
    (call.caller.startsWith('person:') && getPerson(call.caller.slice(7))?.displayName) || 'Someone'
  const hostId = getSelfHostId()
  await deliver(targets, to => ({
    to,
    title: `${callerName} is calling`,
    body: 'Open AI Maestro to answer.',
    data: { type: 'call', callId: call.callId, hostId },
    channelId: 'call',
    priority: 'high',
    sound: 'default',
    interruptionLevel: 'time-sensitive',
    ttl,
  }))
}
