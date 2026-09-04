/**
 * PUT  /api/v1/attachments/{id}/content?token=  — upload the bytes (step 2)
 * GET  /api/v1/attachments/{id}/content?token=  — download them (section 6)
 *
 * Both are authorised by the capability token in the URL rather than an API
 * key. The spec requires the download URL to work for "cross-provider
 * recipients ... without an account on the originating provider", and that URL
 * travels inside a message to another host, where an API key must never go.
 */
import { NextRequest, NextResponse } from 'next/server'
import { receiveContent, downloadContent } from '@/services/amp-attachments-service'
import { toResponse } from '@/app/api/_helpers'
import { isServiceError } from '@/services/service-errors'

export const dynamic = 'force-dynamic'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = request.nextUrl.searchParams.get('token')
  const bytes = Buffer.from(await request.arrayBuffer())
  return toResponse(receiveContent(id, token, bytes))
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = request.nextUrl.searchParams.get('token')
  const result = downloadContent(id, token)
  // ServiceResult unions data with ServiceError, so narrow before using it.
  if (!result.data || isServiceError(result.data)) return toResponse(result)

  const { bytes, filename, contentType, digest } = result.data
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.length),
      // Spec section 6: the client prefers the server-sanitized filename from
      // Content-Disposition over the one in the payload.
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Digest': digest,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}
