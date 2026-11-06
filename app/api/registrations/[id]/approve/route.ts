import { NextRequest } from 'next/server'
import { approveRegistration } from '@/services/amp-registrations-service'
import { toResponse } from '@/app/api/_helpers'

/** POST /api/registrations/:id/approve */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(approveRegistration(id))
}
