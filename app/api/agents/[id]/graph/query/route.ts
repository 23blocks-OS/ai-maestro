import { NextRequest, NextResponse } from 'next/server'
import { queryGraph } from '@/services/agents-graph-service'
import { isValidUuid } from '@/lib/validation'

/**
 * GET /api/agents/:id/graph/query
 * Query the code/component graph with various query types
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: agentId } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const searchParams = request.nextUrl.searchParams

    const result = await queryGraph(agentId, {
      queryType: searchParams.get('q'),
      name: searchParams.get('name'),
      type: searchParams.get('type'),
      from: searchParams.get('from'),
      to: searchParams.get('to'),
    })

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error, ...(result.data || {}) }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Graph Query GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
