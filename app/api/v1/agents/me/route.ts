/**
 * AMP v1 Agent Self-Management Endpoint
 *
 * GET    /api/v1/agents/me
 * PATCH  /api/v1/agents/me
 * DELETE /api/v1/agents/me
 *
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAgentSelf, updateAgentSelf, deleteAgentSelf } from '@/services/amp-service'
import type { AMPError } from '@/lib/types/amp'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const result = getAgentSelf(authHeader)
  return NextResponse.json(result.data!, { status: result.status })
}

export async function PATCH(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')

  let body: { alias?: string; delivery?: Record<string, unknown>; metadata?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({
      error: 'invalid_request',
      message: 'Invalid JSON body'
    } as AMPError, { status: 400 })
  }

  const result = await updateAgentSelf(authHeader, body)
  return NextResponse.json(result.data!, { status: result.status })
}

export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const result = await deleteAgentSelf(authHeader)
  return NextResponse.json(result.data!, { status: result.status })
}
