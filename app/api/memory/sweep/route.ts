/**
 * POST /api/memory/sweep — run memory maintenance across agents on disk.
 * GET  /api/memory/sweep — which agents are eligible and when each was last swept.
 *
 * Indexing never needed a resident Agent object; it only needed an agent id.
 * See lib/memory/sweep.ts for why running it off the LRU matters.
 *
 * Reads live state, so it must stay dynamic — a statically prerendered handler
 * would serve a build-time snapshot.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sweepAgentMemory, listIndexableAgents } from '@/lib/memory/sweep'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ eligible: listIndexableAgents().length })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const result = await sweepAgentMemory({
      limit: body.limit,
      minAgeMs: body.minAgeMs,
      only: body.only,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('[Memory Sweep API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
