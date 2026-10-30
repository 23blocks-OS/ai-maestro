/**
 * Which other host owns this agent?
 *
 * A dashboard shows agents from every host, but this host's registry only holds its own. A request
 * the browser sends here about an agent that lives on a peer (a credential card, a SQL approval)
 * must be forwarded to that peer. Asking each peer "do you know this agent?" finds it; the answer
 * is remembered for a minute (a miss for 30 seconds), so the cards' 3-second polling does not probe every time.
 */
import { getHosts, isSelf } from '@/lib/hosts-config'

const PROBE_TIMEOUT_MS = 4000
const CACHE_MS = 60_000
// Misses are cached too, shorter: an agent no host knows would otherwise be probed on every poll.
const MISS_CACHE_MS = 30_000
const found = new Map<string, { url: string | undefined; at: number }>()
// Concurrent callers for the same agent share one probe instead of each fanning out.
const inFlight = new Map<string, Promise<string | undefined>>()

export async function findPeerHostUrl(agentId: string, fetchImpl: typeof fetch = fetch): Promise<string | undefined> {
  const hit = found.get(agentId)
  if (hit && Date.now() - hit.at < (hit.url ? CACHE_MS : MISS_CACHE_MS)) return hit.url
  const pending = inFlight.get(agentId)
  if (pending) return pending
  const probe = probePeers(agentId, fetchImpl)
    .then((url) => { found.set(agentId, { url, at: Date.now() }); return url })
    .finally(() => inFlight.delete(agentId))
  inFlight.set(agentId, probe)
  return probe
}

async function probePeers(agentId: string, fetchImpl: typeof fetch): Promise<string | undefined> {
  const peers = getHosts().filter(h => h.url && h.enabled !== false && !isSelf(h.id))
  const answers = await Promise.all(peers.map(async (host) => {
    const base = host.url.replace(/\/$/, '')
    try {
      const res = await fetchImpl(`${base}/api/agents/${encodeURIComponent(agentId)}`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
      return res.ok ? base : undefined
    } catch {
      return undefined
    }
  }))
  return answers.find(Boolean)
}

export function forgetPeerHost(agentId: string): void {
  found.delete(agentId)
}
