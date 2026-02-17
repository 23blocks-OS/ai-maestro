/**
 * AMP v1 API Key Revocation
 *
 * DELETE /api/v1/auth/revoke-key
 *
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { revokeKey } from '@/services/amp-service'

export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const result = revokeKey(authHeader)
  return NextResponse.json(result.data!, { status: result.status })
}
