import { NextRequest } from 'next/server'
import { getCaller } from '@/services/caller-service'
import { callerFromHeaders } from '@/lib/caller-identity'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/caller -> { kind, agentId?, name?, via?, mode }
 */
export async function GET(request: NextRequest) {
  return toResponse(getCaller(callerFromHeaders(request.headers)))
}
