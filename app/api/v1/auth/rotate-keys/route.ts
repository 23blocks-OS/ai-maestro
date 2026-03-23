/**
 * AMP v1 Keypair Rotation
 *
 * POST /api/v1/auth/rotate-keys
 *
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { rotateKeypair } from '@/services/amp-service'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const authHeader = request.headers.get('Authorization')
  const result = await rotateKeypair(body, authHeader)
  return NextResponse.json(result.data!, { status: result.status })
}
