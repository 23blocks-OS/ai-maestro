import { triggerMeshSync, getMeshStatus } from '@/services/hosts-service'
import { toResponse } from '@/app/api/_helpers'

// Force this route to be dynamic
export const dynamic = 'force-dynamic'

/**
 * POST /api/hosts/sync
 *
 * Manually trigger synchronization with all known peers.
 */
export async function POST() {
  const result = await triggerMeshSync()
  return toResponse(result)
}

/**
 * GET /api/hosts/sync
 *
 * Get the current mesh status without triggering a sync.
 */
export async function GET() {
  const result = await getMeshStatus()
  return toResponse(result)
}
