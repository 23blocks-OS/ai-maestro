/**
 * Canvas Interactions API
 *
 * POST /api/agents/:id/canvas/interactions — Submit a canvas interaction
 * GET  /api/agents/:id/canvas/interactions — List canvas interactions
 *
 * Thin wrapper — business logic in services/agents-canvas-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { submitInteraction, listInteractions } from '@/services/agents-canvas-service'
import { toResponse } from '@/app/api/_helpers'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const result = await submitInteraction(id, body)
    return toResponse(result)
  } catch (error) {
    console.error('[Canvas Interactions API] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10)
    const result = listInteractions(id, limit)
    return toResponse(result)
  } catch (error) {
    console.error('[Canvas Interactions API] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
