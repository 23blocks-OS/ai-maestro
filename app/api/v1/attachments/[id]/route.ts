/**
 * GET /api/v1/attachments/{id} — status, polled by the client until
 * scan_status leaves `pending` (spec section 4, step 4).
 */
import { NextRequest } from 'next/server'
import { getAttachmentStatus } from '@/services/amp-attachments-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(getAttachmentStatus(id, request.headers.get('authorization')))
}
