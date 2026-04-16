import { getSubconsciousStatus } from '@/services/config-service'
import { toResponse } from '@/app/api/_helpers'

// Force dynamic rendering - agent count changes at runtime
export const dynamic = 'force-dynamic'

/**
 * GET /api/subconscious
 * Get the global subconscious status across all agents.
 * Reads from status FILES instead of loading agents into memory.
 */
export async function GET() {
  const result = getSubconsciousStatus()
  return toResponse(result)
}
