/**
 * GET /api/v1/quarantine?status=pending&limit=20[&localOnly=1] — quarantine entries of `ask` rules (AMP 08
 * "Quarantine Management", F118 step 2): this host's, and every peer's unless localOnly.
 */
import { NextRequest } from 'next/server'
import { listPolicyQuarantine } from '@/services/policy-service'
import { toResponse } from '@/app/api/_helpers'
import { callerFromHeaders } from '@/lib/caller-identity'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  return toResponse(await listPolicyQuarantine({ status: q.get('status'), limit: q.get('limit'), localOnly: q.get('localOnly') === '1' }, undefined,
    callerFromHeaders(request.headers), request.headers.get('x-forwarded-from')))
}
