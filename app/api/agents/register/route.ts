import { registerAgent } from '@/services/agents-core-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agents/register
 * Register an agent from session name or cloud config.
 */
export async function POST(request: Request) {
  const body = await request.json()
  const result = registerAgent(body)
  return toResponse(result)
}
