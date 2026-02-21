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
  try {
    const { id } = await params

    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body?.rejectorAgentId || !body?.password) {
      return NextResponse.json({ error: 'Missing required fields: rejectorAgentId, password' }, { status: 400 })
    }

    const result = await rejectCrossHostRequest(id, body.rejectorAgentId, body.password, body.reason)
    return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
  } catch (err) {
    return NextResponse.json({ error: `Internal server error: ${(err as Error).message}` }, { status: 500 })
  }
}
