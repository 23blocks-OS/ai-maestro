/**
 * GET /api/policy/requests[?state=pending][&localOnly=1] — approval requests for `ask` rules (F118 step 2):
 * this host's, and every peer's unless localOnly
 */
import { NextRequest } from 'next/server'
import { listPolicyRequests } from '@/services/policy-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  return toResponse(await listPolicyRequests({ state: q.get('state'), localOnly: q.get('localOnly') === '1' }))
}
