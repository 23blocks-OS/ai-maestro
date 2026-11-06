import { NextRequest } from 'next/server'
import { listPendingRegistrations, setRegistrationApproval } from '@/services/amp-registrations-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/** GET /api/registrations — this host's setting and the AMP registrations waiting for the owner */
export async function GET() {
  return toResponse(listPendingRegistrations())
}

/** PUT /api/registrations — { approvalRequired: boolean }, this host only */
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return toResponse(setRegistrationApproval(body))
}
