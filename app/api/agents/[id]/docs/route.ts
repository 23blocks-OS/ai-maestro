/**
 * Agent Docs API
 *
 * GET    /api/agents/:id/docs — Query documentation
 * POST   /api/agents/:id/docs — Index documentation
 * DELETE /api/agents/:id/docs — Clear documentation
 *
 * Thin wrapper — business logic in services/agents-docs-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { queryDocs, indexDocs, clearDocs } from '@/services/agents-docs-service'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const searchParams = request.nextUrl.searchParams

    const result = await queryDocs(agentId, {
      action: searchParams.get('action') || 'stats',
      q: searchParams.get('q'),
      keyword: searchParams.get('keyword'),
      type: searchParams.get('type'),
      docId: searchParams.get('docId'),
      limit: parseInt(searchParams.get('limit') || '10', 10),
      project: searchParams.get('project'),
    })

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Docs API] Error:', error)
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

    let body: any = {}
    try {
      const text = await request.text()
      if (text && text.trim()) {
        body = JSON.parse(text)
      }
    } catch {
      // Empty or invalid body - use defaults
    }

    const result = await indexDocs(agentId, body)
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Docs API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const searchParams = request.nextUrl.searchParams
    const projectPath = searchParams.get('project') || undefined

    const result = await clearDocs(agentId, projectPath)
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Docs API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
