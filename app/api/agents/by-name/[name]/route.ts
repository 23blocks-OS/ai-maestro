import { NextRequest } from 'next/server'
import { lookupAgentByName } from '@/services/agents-core-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/agents/by-name/[name]
 * Check if an agent exists by name on this host (rich resolution)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params
  const result = lookupAgentByName(name)
  return toResponse(result)
}
