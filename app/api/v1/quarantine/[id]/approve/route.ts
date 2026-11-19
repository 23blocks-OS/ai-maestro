/**
 * POST /api/v1/quarantine/{id}/approve — { by?, host? } (AMP 08). Releases the message once. With host, the decision
 * goes to the host that keeps the entry.
 */
import { NextRequest } from 'next/server'
import { decidePolicyQuarantine } from '@/services/policy-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(await decidePolicyQuarantine(id, 'approve', body))
}
