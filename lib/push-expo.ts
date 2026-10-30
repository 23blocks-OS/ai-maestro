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
import type { PersonDevice, PushType } from '@/types/person-device'

const SEND_URL = 'https://exp.host/--/api/v2/push/send'
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
const BATCH = 100 // Expo's limit per request
const TIMEOUT_MS = 10_000
const RECEIPT_DELAY_MS = 15 * 60_000 // Expo asks for receipts no sooner than this
/** One push per agent per type in this window, so a flapping agent does not buzz the phone */
export const COOLDOWN_MS = 60_000

const g = globalThis as unknown as { _pushLastSent?: Map<string, number>; _pushOfflineLogged?: boolean }
const lastSent = (g._pushLastSent ||= new Map<string, number>())

interface ExpoMessage {
  to: string
  title: string
  body: string
  data: { type: PushType; agentId?: string; hostId: string }
  channelId: string
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
    return await res.json()
  } catch (error) {
    // No internet, DNS, timeout: skip quietly (one line, once), the app keeps working without push
    if (!g._pushOfflineLogged) { g._pushOfflineLogged = true; console.log(`[Push] Expo unreachable (${(error as Error).message}); push skipped`) }
    return null
  }
}

const dead = (t: Ticket) => t.status === 'error' && t.details?.error === 'DeviceNotRegistered'

/** Receipts report failures that tickets cannot (the token was fine when Expo took it, then Apple/Google refused) */
function checkReceiptsLater(ids: { id: string; deviceId: string }[]) {
  if (!ids.length) return
  const timer = setTimeout(async () => {
    const res = await post(RECEIPTS_URL, { ids: ids.map(i => i.id) })
    const receipts = (res?.data || {}) as Record<string, Ticket>
    for (const { id, deviceId } of ids) if (receipts[id] && dead(receipts[id])) clearPushToken(deviceId)
  }, RECEIPT_DELAY_MS)
  timer.unref()
}

/** Send one message per device to Expo, drop dead tokens. No retries. */
async function deliver(targets: PersonDevice[], make: (to: string) => ExpoMessage): Promise<void> {
  for (let i = 0; i < targets.length; i += BATCH) {
    const chunk = targets.slice(i, i + BATCH)
    const res = await post(SEND_URL, chunk.map(d => make(d.pushToken!)))
    const tickets = Array.isArray(res?.data) ? (res!.data as Ticket[]) : []
    const pending: { id: string; deviceId: string }[] = []
    tickets.forEach((t, n) => {
      if (dead(t)) clearPushToken(chunk[n].deviceId)
      else if (t.status === 'ok' && t.id) pending.push({ id: t.id, deviceId: chunk[n].deviceId })
    })
    checkReceiptsLater(pending)
  }
}

/** An agent started waiting on a person. Notifies every paired device that opted in to `needs_you`. */
export async function pushNeedsYou(agentId?: string, sessionName?: string): Promise<void> {
  const targets = loadDevices().filter(d => d.pushToken && d.pushTypes?.includes('needs_you'))
  if (!targets.length) return
  const key = `needs_you:${agentId || sessionName}`
  const now = Date.now()
  if (now - (lastSent.get(key) ?? 0) < COOLDOWN_MS) return
  lastSent.set(key, now)
  const name = (agentId && getAgent(agentId)?.name) || sessionName || 'An agent'
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
