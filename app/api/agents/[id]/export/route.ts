/**
 * Agent Export API
 *
 * GET  /api/agents/[id]/export — Export agent as ZIP download
 * POST /api/agents/[id]/export — Create transcript export job
 *
 * Thin wrapper — business logic in services/agents-transfer-service.ts
 */

import { NextResponse } from 'next/server'
import { exportAgentZip, createTranscriptExportJob } from '@/services/agents-transfer-service'
import { toResponse } from '@/app/api/_helpers'
import { isServiceError } from '@/services/service-errors'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const result = await exportAgentZip(params.id)

    if (!result.data || isServiceError(result.data)) {
      return toResponse(result)
    }

    const { buffer, filename, agentId, agentName } = result.data

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
        'X-Agent-Id': agentId,
        'X-Agent-Name': agentName,
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
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const result = createTranscriptExportJob(params.id, body)
    return toResponse(result)
  } catch (error) {
    console.error('Failed to create transcript export job:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create transcript export job' },
      { status: 500 }
    )
  }
}
