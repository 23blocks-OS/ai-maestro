import { getHostLoad } from '@/services/hosts-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/hosts/load
 *
 * This host's RAM, swap, load averages, core count and number of agents with a
 * running session, measured at request time. To read another host, call this
 * route on that host.
 */
export async function GET() {
  return toResponse(getHostLoad())
}
