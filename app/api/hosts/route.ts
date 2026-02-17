import { NextRequest, NextResponse } from 'next/server'
import { listHosts, addNewHost } from '@/services/hosts-service'

// Force this route to be dynamic (not statically generated at build time)
export const dynamic = 'force-dynamic'

/**
 * GET /api/hosts
 *
 * Returns the list of configured hosts (local and remote).
 */
export async function GET() {
  const result = await listHosts()
  if (result.error) {
    return NextResponse.json({ error: result.error, hosts: [] }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}

/**
 * POST /api/hosts
 *
 * Add a new host to the configuration with bidirectional sync.
 */
export async function POST(request: NextRequest) {
  const syncEnabled = request.nextUrl.searchParams.get('sync') !== 'false'
  const host = await request.json()

  const result = await addNewHost({ host, syncEnabled })
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
