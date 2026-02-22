/**
 * Agent Playback API
 *
 * GET  /api/agents/[id]/playback — Get playback state
 * POST /api/agents/[id]/playback — Control playback
 *
 * Thin wrapper — business logic in services/agents-playback-service.ts
 */

import { NextResponse } from 'next/server'
import { getPlaybackState, controlPlayback } from '@/services/agents-playback-service'
import { isValidUuid } from '@/lib/validation'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    const result = getPlaybackState(id, sessionId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Playback API] Failed to get playback state:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get playback state' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const result = controlPlayback(id, body)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Playback API] Failed to control playback:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to control playback' },
      { status: 500 }
    )
  }
}
