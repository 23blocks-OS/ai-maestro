/**
 * Cross-Host Governance Requests Endpoint
 *
 * POST /api/v1/governance/requests  — Submit or receive a cross-host governance request
 * GET  /api/v1/governance/requests  — List governance requests with optional filtering
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  submitCrossHostRequest,
  receiveCrossHostRequest,
  listCrossHostRequests,
} from '@/services/cross-host-governance-service'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json()

  // Determine if this is a remote receive (fromHostId present) or local submission
  if (body?.fromHostId) {
    const result = await receiveCrossHostRequest(body.fromHostId, body.request)
    return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
  }

  const result = await submitCrossHostRequest(body)
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const result = listCrossHostRequests({
    status: (searchParams.get('status') as import('@/types/governance-request').GovernanceRequestStatus) || undefined,
    hostId: searchParams.get('hostId') || undefined,
    agentId: searchParams.get('agentId') || undefined,
  })
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
}
