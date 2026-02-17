import { NextResponse } from 'next/server'
import { listSessions, listLocalSessions } from '@/services/sessions-service'

// Force this route to be dynamic (not statically generated at build time)
export const dynamic = 'force-dynamic'

/**
 * GET /api/sessions
 * Fetches sessions from all configured hosts (local + remote workers)
 * Pass ?local=true to only fetch local sessions (prevents cascading fan-out)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const localOnly = searchParams.get('local') === 'true'

    if (localOnly) {
      const result = await listLocalSessions()
      return NextResponse.json({ sessions: result.sessions, fromCache: false })
    }

    const result = await listSessions()
    return NextResponse.json({ sessions: result.sessions, fromCache: result.fromCache })
  } catch (error) {
    console.error('[Sessions] Failed to fetch sessions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sessions', sessions: [] },
      { status: 500 }
    )
  }
}
