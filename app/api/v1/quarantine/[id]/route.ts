/** GET /api/v1/quarantine/{id}[?host=] — one quarantine entry (AMP 08); with host, from the host that keeps it */
import { NextRequest } from 'next/server'
import { getPolicyQuarantine } from '@/services/policy-service'
import { toResponse } from '@/app/api/_helpers'
import { callerFromHeaders } from '@/lib/caller-identity'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(await getPolicyQuarantine(id, request.nextUrl.searchParams.get('host'), undefined,
    callerFromHeaders(request.headers), request.headers.get('x-forwarded-from')))
}
