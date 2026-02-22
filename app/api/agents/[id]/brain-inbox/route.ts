/**
 * Brain Inbox API
 *
 * GET /api/agents/[id]/brain-inbox — Read and clear brain inbox signals
 *
 * Returns signals from cerebellum and subconscious destined for the cortex.
 * Reading clears the inbox (signals are delivered exactly once).
 */

import { NextRequest, NextResponse } from 'next/server'
import { readAndClearBrainInbox } from '@/lib/cerebellum/brain-inbox'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const signals = readAndClearBrainInbox(agentId)
    return NextResponse.json({ signals })
  } catch (error) {
    console.error('[Brain Inbox API] Error:', error)
    return NextResponse.json(
      { signals: [], error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
