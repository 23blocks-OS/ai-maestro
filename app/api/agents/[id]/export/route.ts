/**
 * Agent Export API
 *
 * GET  /api/agents/[id]/export — Export agent as ZIP download
 * POST /api/agents/[id]/export — Create transcript export job
 *
 * Thin wrapper — business logic in services/agents-transfer-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { exportAgentZip, createTranscriptExportJob } from '@/services/agents-transfer-service'
import { isValidUuid } from '@/lib/validation'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const result = await exportAgentZip(id)

    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const { buffer, filename, agentId, agentName } = result.data

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename.replace(/["\r\n\\]/g, '_')}"`,
        'Content-Length': buffer.length.toString(),
        'X-Agent-Id': agentId,
        // SF-006 fix: Sanitize agent name to prevent header injection
        'X-Agent-Name': agentName.replace(/[\r\n]/g, ''),
        'X-Export-Version': '1.0.0'
      }
    })
  } catch (error) {
    console.error('Failed to export agent:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export agent' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const result = createTranscriptExportJob(id, body)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Failed to create transcript export job:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create transcript export job' },
      { status: 500 }
    )
  }
}
