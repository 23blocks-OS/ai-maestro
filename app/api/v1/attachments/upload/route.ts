/**
 * POST /api/v1/attachments/upload — request an upload URL.
 *
 * Step 1 of the AMP attachment flow (spec/attachment-guide.md section 4).
 * `amp-send.sh --attach` has been calling this and receiving 404 since the flag
 * shipped; the client needs no changes.
 */
import { NextRequest } from 'next/server'
import { initUpload } from '@/services/amp-attachments-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return toResponse(initUpload(body, request.headers.get('authorization')))
}
