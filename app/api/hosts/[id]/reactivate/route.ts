import { NextRequest } from 'next/server'
import { reactivateHost } from '@/services/hosts-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/hosts/[id]/reactivate
 *
 * Re-enable a host that was disabled by the circuit breaker.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await reactivateHost(id)
  return toResponse(result)
}
