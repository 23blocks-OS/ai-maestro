/**
 * Manager Trust DELETE Endpoint (Full-mode Next.js route)
 *
 * DELETE /api/governance/trust/:hostId  -- Remove a trusted manager (requires governance password)
 *
 * Mirrors the headless-router handler at services/headless-router.ts:1373-1376
 * Business logic in services/governance-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { removeTrust } from '@/services/governance-service'

// NT-030: Ensure Next.js does not cache this route
export const dynamic = 'force-dynamic'

/** DELETE: Remove a trusted manager by hostId */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ hostId: string }> }
) {
  try {
    const { hostId } = await params
    // SF-027: Validate hostId as a safe hostname format before passing to service
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,253}[a-zA-Z0-9]$/.test(hostId) && !/^[a-zA-Z0-9]$/.test(hostId)) {
      return NextResponse.json({ error: 'Invalid hostId format' }, { status: 400 })
    }
    let body: { password?: string } = {}
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const result = await removeTrust(hostId, body?.password)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
