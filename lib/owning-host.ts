/**
 * Which other host owns this agent?
 *
 * A dashboard shows agents from every host, but this host's registry only holds its own. A request
 * the browser sends here about an agent that lives on a peer (a credential card, a SQL approval)
 * must be forwarded to that peer. Asking each peer "do you know this agent?" finds it; the answer
 * is remembered for a minute, so the cards' 3-second polling does not probe every time.
 */
import { getHosts, isSelf } from '@/lib/hosts-config'

const PROBE_TIMEOUT_MS = 4000
const CACHE_MS = 60_000
const found = new Map<string, { url: string; at: number }>()

export async function findPeerHostUrl(agentId: string, fetchImpl: typeof fetch = fetch): Promise<string | undefined> {
  const hit = found.get(agentId)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.url
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
  const url = answers.find(Boolean)
  if (url) found.set(agentId, { url, at: Date.now() })
  return url
}

export function forgetPeerHost(agentId: string): void {
  found.delete(agentId)
}
