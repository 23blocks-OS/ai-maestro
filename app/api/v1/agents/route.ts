/**
 * AMP v1 Agent List
 *
 * GET /api/v1/agents
 *
 * Thin wrapper - business logic in services/amp-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { listAMPAgents } from '@/services/amp-service'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')

  const result = listAMPAgents(authHeader, search)
  return NextResponse.json(result.data!, { status: result.status })
}
