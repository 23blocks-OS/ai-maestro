/**
 * GET /api/policy/check?from=&to=[&action=call][&localOnly=1] — may `from` reach `to`, and if not, why (F042)
 */
import { NextRequest } from 'next/server'
import { explainPolicy } from '@/services/policy-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  return toResponse(await explainPolicy({ from: q.get('from'), to: q.get('to'), action: q.get('action'), localOnly: q.get('localOnly') === '1' }))
}
