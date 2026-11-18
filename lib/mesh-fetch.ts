/**
 * The browser side of the page feeds (services/mesh-feeds-service.ts): ask this page's own host once for a feed
 * (its answer plus the peers' copies from /mesh), and ask directly only the hosts that are not in that answer.
 * Each host's result has the same shape the per-host route always gave, so the hooks keep their own logic.
 */
import { isSelfHost } from '@/lib/host-kind'
import type { Host } from '@/types/host'

export interface HostAnswer<T> { host: Host; base: string; ok: boolean; data: T | null }

export async function fetchFeedFromHosts<T>(hosts: Host[], feed: string, path: string, timeoutMs = 8000, opts: { missingIsEmpty?: boolean } = {}): Promise<HostAnswer<T>[]> {
  const targets: Host[] = hosts.length > 0
    ? hosts.filter(h => h.enabled !== false)
    : [{ id: 'local', name: 'This host', url: '', isSelf: true } as Host]
  // One call to this page's own host
  let own: { self: T; peers: Array<{ hostId: string; data: T }> } | null = null
  try {
    const res = await fetch(`/api/mesh/${feed}`, { signal: AbortSignal.timeout(timeoutMs) })
    if (res.ok) own = await res.json()
  } catch { /* fall back to asking each host */ }
  const peers = new Map((own?.peers || []).map(p => [p.hostId, p.data]))
  return Promise.all(targets.map(async (host): Promise<HostAnswer<T>> => {
    const self = isSelfHost(host)
    const base = self ? '' : host.url.replace(/\/$/, '')
    if (self && own) return { host, base, ok: true, data: own.self }
    if (!self && peers.has(host.id)) return { host, base, ok: true, data: peers.get(host.id) as T }
    // Not on the mesh (down, or an older version): ask it directly, as before
    try {
      const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(timeoutMs) })
      // A host that has not been updated yet may not have the route: it holds no records, it is not down
      if (res.status === 404 && opts.missingIsEmpty) return { host, base, ok: true, data: null }
      if (!res.ok) throw new Error(String(res.status))
      return { host, base, ok: true, data: await res.json() as T }
    } catch {
      return { host, base, ok: false, data: null }
    }
  }))
}
