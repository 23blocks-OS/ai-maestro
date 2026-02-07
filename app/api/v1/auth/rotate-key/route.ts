/**
 * AMP v1 API Key Rotation
 *
 * POST /api/v1/auth/rotate-key — Rotate the current API key
 */

import { NextRequest, NextResponse } from 'next/server'
import { extractApiKeyFromHeader, rotateApiKey } from '@/lib/amp-auth'
import type { AMPError, AMPKeyRotationResponse } from '@/lib/types/amp'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const apiKey = extractApiKeyFromHeader(authHeader)

  if (!apiKey) {
    return NextResponse.json({
      error: 'unauthorized',
      message: 'Missing or invalid Authorization header'
    } as AMPError, { status: 401 })
  }

  const result = rotateApiKey(apiKey)

  if (!result) {
    return NextResponse.json({
      error: 'unauthorized',
      message: 'Invalid or expired API key'
    } as AMPError, { status: 401 })
  }

  return NextResponse.json(result as AMPKeyRotationResponse)
}
