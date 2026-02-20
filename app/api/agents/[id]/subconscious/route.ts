/**
 * Agent Subconscious API
 *
 * GET  /api/agents/[id]/subconscious — Get subconscious status
 * POST /api/agents/[id]/subconscious — Trigger subconscious actions
 *
 * Thin wrapper — business logic in services/agents-subconscious-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSubconsciousStatus, triggerSubconsciousAction } from '@/services/agents-subconscious-service'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const result = await getSubconsciousStatus(agentId)
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Agent Subconscious API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const body = await request.json()

    const result = await triggerSubconsciousAction(agentId, body.action)
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Agent Subconscious API] POST Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
