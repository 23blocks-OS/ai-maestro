import { NextRequest } from 'next/server'
import { queryGraph } from '@/services/agents-graph-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/agents/:id/graph/query
 * Query the code/component graph with various query types
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const searchParams = request.nextUrl.searchParams

  const result = await queryGraph(agentId, {
    queryType: searchParams.get('q'),
    name: searchParams.get('name'),
    type: searchParams.get('type'),
    from: searchParams.get('from'),
    to: searchParams.get('to'),
  })

  return toResponse(result)
}
