/**
 * AMP v1 API Key Revocation
 *
 * DELETE /api/v1/auth/revoke-key — Revoke the current API key
 */

import { NextRequest, NextResponse } from 'next/server'
import { extractApiKeyFromHeader, revokeApiKey } from '@/lib/amp-auth'
import type { AMPError } from '@/lib/types/amp'

export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const apiKey = extractApiKeyFromHeader(authHeader)

  if (!apiKey) {
    return NextResponse.json({
      error: 'unauthorized',
      message: 'Missing or invalid Authorization header'
    } as AMPError, { status: 401 })
  }

  const revoked = revokeApiKey(apiKey)

  if (!revoked) {
    return NextResponse.json({
      error: 'not_found',
      message: 'API key not found'
    } as AMPError, { status: 404 })
  }

  return NextResponse.json({
    revoked: true,
    revoked_at: new Date().toISOString(),
  })
}
