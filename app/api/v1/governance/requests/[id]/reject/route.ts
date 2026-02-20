/**
 * Reject Cross-Host Governance Request
 *
 * POST /api/v1/governance/requests/:id/reject
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectCrossHostRequest } from '@/services/cross-host-governance-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  const body = await request.json()

  if (!body?.rejectorAgentId || !body?.password) {
    return NextResponse.json({ error: 'Missing required fields: rejectorAgentId, password' }, { status: 400 })
  }

  const result = await rejectCrossHostRequest(id, body.rejectorAgentId, body.password, body.reason)
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
}
