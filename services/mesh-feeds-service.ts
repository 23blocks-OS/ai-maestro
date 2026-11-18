/**
 * Page feeds over /mesh (docs/SPEC-MESH-SYNC.md, after step 4): projects, open tasks, orgs, teams and the task
 * summary. Each host publishes exactly what its own route answers (the whole answer, one item), and a page asks its
 * own host once (GET /api/mesh/<feed>) for its own answer plus the copies of the connected peers. A host missing
 * from `peers` (down, or not on the mesh) is still asked directly by the page.
 */
import { listProjects } from '@/services/projects-service'
import { getOpenTasks, getTaskSummary } from '@/services/agent-tasks-service'
import { listOrgs } from '@/services/orgs-service'
import { listAllTeams } from '@/services/teams-service'
import { connectedPeerItems } from '@/services/shared-state'
import { hostCapabilities } from '@/lib/host-capabilities'
import { type ServiceResult, notFound } from '@/services/service-errors'

/** Each feed: what the host's own route answers, the same call */
const LOCAL: Record<string, () => ServiceResult<any> | Promise<ServiceResult<any>>> = {
  projects: () => listProjects(),
  tasks: () => getOpenTasks(),
  orgs: () => listOrgs(),
  teams: () => listAllTeams(),
  taskSummary: () => getTaskSummary(),
  // What this host can run (F109): facts and capabilities, each with a reason
  capabilities: async () => ({ data: await hostCapabilities(), status: 200 }),
}
export const PAGE_FEEDS = Object.keys(LOCAL)

/** For the mesh publisher (server.mjs): this host's answer as one item */
export async function localFeed(feed: string): Promise<Record<string, unknown>> {
  const r = await LOCAL[feed]?.()
  if (!r || r.status !== 200) throw new Error(`${feed}: ${(r?.data as any)?.error || r?.status}`)
  return { all: r.data }
}

/** GET /api/mesh/<feed>: this host's answer and every connected peer's */
export async function meshFeedView(feed: string): Promise<ServiceResult<{ self: unknown; peers: Array<{ hostId: string; data: unknown }> }>> {
  const get = LOCAL[feed]
  if (!get) return notFound('Feed', feed)
  const self = await get()
  if (self.status !== 200) return self as any
  const peers = connectedPeerItems(feed).filter(p => p.items.all !== undefined).map(p => ({ hostId: p.hostId, data: p.items.all }))
  return { data: { self: self.data, peers }, status: 200 }
}
