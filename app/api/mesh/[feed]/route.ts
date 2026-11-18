/**
 * GET /api/mesh/[feed] — this host's answer for a page feed (projects, tasks, orgs, teams, taskSummary) plus the
 * copies of the peers on /mesh. Thin wrapper: services/mesh-feeds-service.ts
 */
import { meshFeedView } from '@/services/mesh-feeds-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ feed: string }> }) {
  const { feed } = await params
  return toResponse(await meshFeedView(feed))
}
