/**
 * Agent Canvas API
 *
 * GET /api/agents/:id/canvas         — List canvas HTML files
 * GET /api/agents/:id/canvas?file=X  — Serve raw HTML file
 *
 * Thin wrapper — business logic in services/agents-canvas-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { listCanvasFiles, getCanvasFile } from '@/services/agents-canvas-service'
import { toResponse } from '@/app/api/_helpers'
import { isServiceError } from '@/services/service-errors'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const file = request.nextUrl.searchParams.get('file')

    if (file) {
      // Serve raw HTML file
      const result = getCanvasFile(agentId, file)
      if (result.status !== 200 || !result.data || isServiceError(result.data)) {
        return toResponse(result)
      }

      const { content, fileName } = result.data as { content: string; fileName: string; size: number }
      return new Response(content, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Canvas-File': fileName,
        },
      })
    }

    // List canvas files
    const result = listCanvasFiles(agentId)
    return toResponse(result)
  } catch (error) {
    console.error('[Canvas API] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
