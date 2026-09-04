/**
 * POST /api/v1/attachments/{id}/confirm — step 3 of the upload flow.
 *
 * Scanning happens when the bytes arrive, so this reports the verdict rather
 * than starting the work.
 */
import { NextRequest } from 'next/server'
import { confirmUpload } from '@/services/amp-attachments-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(confirmUpload(id, request.headers.get('authorization')))
}
