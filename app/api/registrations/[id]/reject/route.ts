import { NextRequest } from 'next/server'
import { rejectRegistration } from '@/services/amp-registrations-service'
import { toResponse } from '@/app/api/_helpers'

/** POST /api/registrations/:id/reject */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(rejectRegistration(id))
}
