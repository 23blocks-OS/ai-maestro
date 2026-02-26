/**
 * Approve Cross-Host Governance Request
 *
 * POST /api/v1/governance/requests/:id/approve
 */

import { NextRequest, NextResponse } from 'next/server'
import { approveCrossHostRequest } from '@/services/cross-host-governance-service'
import { isValidUuid } from '@/lib/validation'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params

    // MF-013: Validate request ID is a valid UUID before passing to service
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid request ID format' }, { status: 400 })
    }

    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body?.approverAgentId || !body?.password) {
      return NextResponse.json({ error: 'Missing required fields: approverAgentId, password' }, { status: 400 })
    }

    // SF-024: Validate approverAgentId is a string and valid UUID
    if (typeof body.approverAgentId !== 'string' || !isValidUuid(body.approverAgentId)) {
      return NextResponse.json({ error: 'Invalid approverAgentId format' }, { status: 400 })
    }

    const result = await approveCrossHostRequest(id, body.approverAgentId, body.password)
    // MF-004 (P8): Explicit error branching instead of fragile nullish coalescing
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (err) {
    // MF-011: Log full error internally, return generic message to prevent information disclosure
    console.error('[Governance Approve] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
