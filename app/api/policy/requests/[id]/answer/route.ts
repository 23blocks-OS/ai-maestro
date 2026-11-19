/**
 * POST /api/policy/requests/:id/answer — { answer: 'once'|'for'|'always'|'refuse', for?, by?, keyId?, signature?, signedAt?, host? }
 * Answers an approval request (F118 step 2). With `host`, the answer goes to the host that keeps the request.
 */
import { NextRequest } from 'next/server'
import { answerPolicyRequest } from '@/services/policy-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(await answerPolicyRequest(id, body))
}
