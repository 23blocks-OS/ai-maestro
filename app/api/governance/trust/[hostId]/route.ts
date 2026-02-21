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

/** DELETE: Remove a trusted manager by hostId */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ hostId: string }> }
) {
  try {
    const { hostId } = await params
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
