import { NextResponse } from 'next/server'
import { getActivity, httpGet } from '@/services/sessions-service'
import { getSnapshots } from '@/services/status-snapshots-service'

// Disable caching - this endpoint reads from global state that changes frequently
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  try {
    const activity = await getActivity()
    // Status snapshots (model, context, /compact hint, cost, mode...) ride beside
    // the activity. A failure there must not cost the activity. `?local=true` is
    // what another host asks for: this host's own agents only.
    let snapshots = {}
    try {
      const localOnly = new URL(request.url).searchParams.get('local') === 'true'
      snapshots = getSnapshots({ localOnly, httpGet })
    } catch (error) {
      console.error('Failed to build status snapshots:', error)
    }
    return NextResponse.json({ activity, snapshots })
  } catch (error) {
    console.error('Failed to fetch activity:', error)
    return NextResponse.json(
      { error: 'Failed to fetch activity', activity: {}, snapshots: {} },
      { status: 500 }
    )
  }
}
