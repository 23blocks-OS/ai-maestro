/**
 * Approve Cross-Host Governance Request
 *
 * POST /api/v1/governance/requests/:id/approve
 */

import { NextRequest, NextResponse } from 'next/server'
import { approveCrossHostRequest } from '@/services/cross-host-governance-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  const body = await request.json()

  if (!body?.approverAgentId || !body?.password) {
    return NextResponse.json({ error: 'Missing required fields: approverAgentId, password' }, { status: 400 })
  }

  const result = await approveCrossHostRequest(id, body.approverAgentId, body.password)
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
}
