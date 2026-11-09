import { NextResponse } from 'next/server'
import { getActivity } from '@/services/sessions-service'
import { getSnapshots } from '@/services/status-snapshots-service'

// Disable caching - this endpoint reads from global state that changes frequently
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  try {
    // `?local=true` is what another host asks for: this host's own agents only.
    const localOnly = new URL(request.url).searchParams.get('local') === 'true'
    const activity = await getActivity({ localOnly })
    // Status snapshots (model, context, /compact hint, cost, mode...) ride beside
    // the activity. A failure there must not cost the activity.
    let snapshots = {}
    try {
      snapshots = getSnapshots({ localOnly })
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
