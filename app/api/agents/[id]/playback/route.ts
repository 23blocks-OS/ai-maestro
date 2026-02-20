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

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    const result = getPlaybackState(params.id, sessionId)
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
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const result = controlPlayback(params.id, body)
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
