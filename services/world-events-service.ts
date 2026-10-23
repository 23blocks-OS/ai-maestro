/**
 * World events: who messaged whom, lately. It feeds the pulses on the World view.
 *
 * Read from the AMP inbox folders (`~/.agent-messaging/agents/<agent-id>/messages/inbox/<sender>/*.json`),
 * which already hold every delivery. Only the envelope's id, sender and time are read; the message
 * BODY and subject never leave the file. A delivery lands on the recipient's host, so each host
 * answers for its own agents and `getWorldEvents` asks every host and joins the answers, the way
 * the unified agent list does.
 */

import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { getHosts, isSelf } from '@/lib/hosts-config'
import type { ServiceResult } from '@/services/service-errors'

export interface WorldEvent {
  /** The message id (the same message is never listed twice) */
  id: string
  /** Delivery time, epoch ms */
  ts: number
  /** The sender, as the name in its AMP address (`crab-gm` from `crab-gm@rnd23blocks.aimaestro.local`) */
  from: string
  /** The recipient's agent id (the folder the message sits in) */
  toAgentId: string
  /** The host that delivered it */
  hostId: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_FILE = 2 * 1024 * 1024
const MAX_EVENTS = 200
/** Never look back further than this, however old `since` is: the pulses are about now */
export const MAX_LOOKBACK_MS = 10 * 60 * 1000

const defaultRoot = () => path.join(os.homedir(), '.agent-messaging', 'agents')

async function readdirSafe(dir: string): Promise<string[]> {
  try { return await fs.readdir(dir) } catch { return [] }
}

/** Deliveries on THIS host after `since` (epoch ms), oldest first. `root` is for tests. */
export async function listLocalWorldEvents(since: number, hostId: string, root = defaultRoot()): Promise<WorldEvent[]> {
  const floor = Math.max(since, Date.now() - MAX_LOOKBACK_MS)
  const agents = (await readdirSafe(root)).filter(n => UUID.test(n))
  const perAgent = await Promise.all(agents.map(async (agentId): Promise<WorldEvent[]> => {
    const inbox = path.join(root, agentId, 'messages', 'inbox')
    const out: WorldEvent[] = []
    for (const sender of await readdirSafe(inbox)) {
      const dir = path.join(inbox, sender)
      // A folder gains a file => its mtime moves: skip the quiet ones without opening them
      try { if ((await fs.stat(dir)).mtimeMs < floor) continue } catch { continue }
      for (const file of await readdirSafe(dir)) {
        if (!file.endsWith('.json')) continue
        const full = path.join(dir, file)
        try {
          const st = await fs.stat(full)
          if (st.mtimeMs < floor || st.size > MAX_FILE) continue
          const env = JSON.parse(await fs.readFile(full, 'utf8'))?.envelope
          if (!env || typeof env.id !== 'string' || typeof env.from !== 'string') continue
          const ts = Date.parse(env.timestamp) || st.mtimeMs
          if (ts <= floor) continue
          out.push({ id: env.id, ts, from: env.from.split('@')[0], toAgentId: agentId, hostId })
        } catch { /* an unreadable or half-written file is skipped */ }
      }
    }
    return out
  }))
  return perAgent.flat().sort((a, b) => a.ts - b.ts).slice(-MAX_EVENTS)
}

export interface WorldEventsParams {
  since: number
  /** Only this host's deliveries (what a peer is asked for; avoids hosts asking each other forever) */
  localOnly: boolean
  selfHostId: string
  timeoutMs?: number
}

/** This host's deliveries, plus every other enabled host's unless `localOnly` */
export async function getWorldEvents(params: WorldEventsParams): Promise<ServiceResult<{ events: WorldEvent[]; now: number; hosts: number }>> {
  const { since, localOnly, selfHostId, timeoutMs = 2000 } = params
  const batches: WorldEvent[][] = [await listLocalWorldEvents(since, selfHostId)]
  let hosts = 1
  if (!localOnly) {
    const peers = getHosts().filter(h => !isSelf(h.id) && h.enabled !== false)
    const answers = await Promise.all(peers.map(async host => {
      try {
        const res = await fetch(`${host.url}/api/world/events?since=${since}&local=1`, {
          signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' },
        })
        if (!res.ok) return null
        const data = await res.json()
        return Array.isArray(data?.events) ? (data.events as WorldEvent[]) : null
      } catch { return null }
    }))
    for (const a of answers) if (a) { batches.push(a); hosts++ }
  }
  const seen = new Set<string>()
  const events = batches.flat().filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true))).sort((a, b) => a.ts - b.ts).slice(-MAX_EVENTS)
  return { data: { events, now: Date.now(), hosts }, status: 200 }
}
