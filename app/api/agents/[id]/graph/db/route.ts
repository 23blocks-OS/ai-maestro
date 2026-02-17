import { NextRequest, NextResponse } from 'next/server'
import { queryDbGraph, indexDbSchema, clearDbGraph } from '@/services/agents-graph-service'

/**
 * GET /api/agents/:id/graph/db
 * Query the database schema graph for an agent
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const searchParams = request.nextUrl.searchParams

  const result = await queryDbGraph(agentId, {
    action: searchParams.get('action') || 'stats',
    name: searchParams.get('name'),
    column: searchParams.get('column'),
    database: searchParams.get('database'),
  })

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error, ...(result.data || {}) }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * POST /api/agents/:id/graph/db
 * Index a PostgreSQL database schema into the graph
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const body = await request.json()

  const result = await indexDbSchema(agentId, body)

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * DELETE /api/agents/:id/graph/db
 * Clear the database schema graph
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const databaseName = request.nextUrl.searchParams.get('database') || ''

  const result = await clearDbGraph(agentId, databaseName)

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
