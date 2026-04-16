import { initializeStartup, getStartupInfo } from '@/services/agents-core-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agents/startup
 * Initialize all registered agents on server boot
 */
export async function POST() {
  const result = await initializeStartup()
  return toResponse(result)
}

/**
 * GET /api/agents/startup
 * Get startup status (how many agents discovered vs initialized)
 */
export async function GET() {
  const result = getStartupInfo()
  return toResponse(result)
}
