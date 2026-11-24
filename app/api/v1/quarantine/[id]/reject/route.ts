/**
 * POST /api/v1/quarantine/{id}/reject — { by?, host? } (AMP 08). Discards the message; it is never delivered. With
 * host, the decision goes to the host that keeps the entry.
 */
import { NextRequest } from 'next/server'
import { decidePolicyQuarantine } from '@/services/policy-service'
import { toResponse } from '@/app/api/_helpers'
import { callerFromHeaders } from '@/lib/caller-identity'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(await decidePolicyQuarantine(id, 'reject', body, undefined, callerFromHeaders(request.headers), request.headers.get('x-forwarded-from')))
}
