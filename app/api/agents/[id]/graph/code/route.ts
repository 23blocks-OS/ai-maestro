import { NextRequest, NextResponse } from 'next/server'
import { queryCodeGraph, indexCodeGraph, deleteCodeGraph } from '@/services/agents-graph-service'
import { isValidUuid } from '@/lib/validation'

/**
 * GET /api/agents/:id/graph/code
 * Query the code graph for an agent
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const searchParams = request.nextUrl.searchParams

    const result = await queryCodeGraph(agentId, {
      action: searchParams.get('action') || 'stats',
      name: searchParams.get('name'),
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      project: searchParams.get('project'),
      nodeId: searchParams.get('nodeId'),
      depth: parseInt(searchParams.get('depth') || '1', 10) || 1,
    })

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Graph Code GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/agents/:id/graph/code
 * Index a project's code into the graph
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }

    // Parse body - handle empty body gracefully, reject malformed non-empty JSON
    let body: Record<string, unknown> = {} // NT-012: typed instead of `any`
    try {
      const text = await request.text()
      if (text && text.trim()) {
        body = JSON.parse(text)
      }
    } catch {
      // Non-empty body that is not valid JSON should return 400
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const result = await indexCodeGraph(agentId, body)

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Graph Code POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/agents/:id/graph/code
 * Clear the code graph for a project
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const projectPath = request.nextUrl.searchParams.get('project') || ''

    const result = await deleteCodeGraph(agentId, projectPath)

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Graph Code DELETE] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
