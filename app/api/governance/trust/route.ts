/**
 * Manager Trust CRUD Endpoints (Full-mode Next.js routes)
 *
 * GET  /api/governance/trust         -- List all trusted managers
 * POST /api/governance/trust         -- Add a trusted manager (requires governance password)
 *
 * Mirrors the headless-router handlers at services/headless-router.ts:1366-1371
 * Business logic in services/governance-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { listTrustedManagers, addTrust } from '@/services/governance-service'

/** GET: List all trusted managers */
export async function GET() {
  try {
    const result = listTrustedManagers()
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

/** POST: Add a trusted manager (requires governance password) */
export async function POST(request: NextRequest) {
  try {
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const result = await addTrust(body)
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
