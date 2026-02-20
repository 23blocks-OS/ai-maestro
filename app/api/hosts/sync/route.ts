import { NextResponse } from 'next/server'
import { triggerMeshSync, getMeshStatus } from '@/services/hosts-service'

// Force this route to be dynamic
export const dynamic = 'force-dynamic'

/**
 * POST /api/hosts/sync
 *
 * Manually trigger synchronization with all known peers.
 */
export async function POST() {
  const result = await triggerMeshSync()
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}

/**
 * GET /api/hosts/sync
 *
 * Get the current mesh status without triggering a sync.
 */
export async function GET() {
  const result = await getMeshStatus()
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
