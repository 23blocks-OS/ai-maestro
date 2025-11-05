import { NextResponse } from 'next/server'
import { getHosts } from '@/lib/hosts-config'

// Force this route to be dynamic (not statically generated at build time)
export const dynamic = 'force-dynamic'

/**
 * GET /api/hosts
 *
 * Returns the list of configured hosts (local and remote).
 * Used by the UI to display host information and for session creation.
 */
export async function GET() {
  try {
    const hosts = getHosts()
    return NextResponse.json({ hosts })
  } catch (error) {
    console.error('[Hosts API] Failed to fetch hosts:', error)
    return NextResponse.json({ error: 'Failed to fetch hosts', hosts: [] }, { status: 500 })
  }
}
