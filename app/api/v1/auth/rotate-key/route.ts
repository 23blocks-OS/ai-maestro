/**
 * AMP v1 API Key Rotation
 *
 * POST /api/v1/auth/rotate-key
 *
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { rotateKey } from '@/services/amp-service'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const result = rotateKey(authHeader)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
