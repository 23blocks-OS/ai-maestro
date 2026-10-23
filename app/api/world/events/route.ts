import { NextResponse } from 'next/server'
import { getWorldEvents } from '@/services/world-events-service'
import { getSelfHostId } from '@/lib/hosts-config'

// Reads files that change: never prerendered
export const dynamic = 'force-dynamic'

/**
 * GET /api/world/events?since=<epoch ms>[&local=1]
 * Recent AMP deliveries (sender name, recipient agent id, time; never the message) across hosts,
 * for the World view's pulses. `local=1` answers for this host only.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const since = Number(searchParams.get('since'))
  const result = await getWorldEvents({
    since: Number.isFinite(since) && since > 0 ? since : Date.now() - 30_000,
    localOnly: searchParams.get('local') === '1',
    selfHostId: getSelfHostId(),
  })
  return NextResponse.json(result.data, { status: result.status })
}
