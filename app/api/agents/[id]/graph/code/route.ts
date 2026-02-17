import { NextRequest, NextResponse } from 'next/server'
import { queryCodeGraph, indexCodeGraph, deleteCodeGraph } from '@/services/agents-graph-service'

/**
 * GET /api/agents/:id/graph/code
 * Query the code graph for an agent
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const searchParams = request.nextUrl.searchParams

  const result = await queryCodeGraph(agentId, {
    action: searchParams.get('action') || 'stats',
    name: searchParams.get('name'),
    from: searchParams.get('from'),
    to: searchParams.get('to'),
    project: searchParams.get('project'),
    nodeId: searchParams.get('nodeId'),
    depth: parseInt(searchParams.get('depth') || '1', 10),
  })

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * POST /api/agents/:id/graph/code
 * Index a project's code into the graph
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params

  // Parse body - handle empty body gracefully
  let body: any = {}
  try {
    const text = await request.text()
    if (text && text.trim()) {
      body = JSON.parse(text)
    }
  } catch {
    // Empty or invalid body - use defaults
  }

  const result = await indexCodeGraph(agentId, body)

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * DELETE /api/agents/:id/graph/code
 * Clear the code graph for a project
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const projectPath = request.nextUrl.searchParams.get('project') || ''

  const result = await deleteCodeGraph(agentId, projectPath)

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
