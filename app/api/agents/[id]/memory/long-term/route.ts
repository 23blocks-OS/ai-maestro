import { NextRequest, NextResponse } from 'next/server'
import {
  queryLongTermMemories,
  deleteLongTermMemory,
  updateLongTermMemory,
} from '@/services/agents-memory-service'
import type { MemoryCategory } from '@/lib/cozo-schema-memory'

/**
 * GET /api/agents/:id/memory/long-term
 * Query long-term memories with various filters
 *
 * Query parameters:
 * - query: Semantic search query (optional)
 * - category: Filter by category (fact, decision, preference, pattern, insight, reasoning)
 * - limit: Max results (default: 20)
 * - includeRelated: Include related memories (default: false)
 * - minConfidence: Minimum confidence threshold (default: 0)
 * - tier: Filter by tier (warm, long)
 * - view: Special views (stats, recent, reinforced, graph, context)
 * - id: Specific memory ID
 * - maxTokens: Max tokens for context view (default: 2000)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const searchParams = request.nextUrl.searchParams

  const result = await queryLongTermMemories(agentId, {
    query: searchParams.get('query'),
    category: searchParams.get('category') as MemoryCategory | null,
    limit: parseInt(searchParams.get('limit') || '20'),
    includeRelated: searchParams.get('includeRelated') === 'true',
    minConfidence: parseFloat(searchParams.get('minConfidence') || '0'),
    tier: searchParams.get('tier') as 'warm' | 'long' | null,
    view: searchParams.get('view'),
    memoryId: searchParams.get('id'),
    maxTokens: parseInt(searchParams.get('maxTokens') || '2000'),
  })

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * DELETE /api/agents/:id/memory/long-term
 * Delete a specific memory by ID
 *
 * Query parameters:
 * - id: Memory ID to delete (required)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const memoryId = request.nextUrl.searchParams.get('id') || ''

  const result = await deleteLongTermMemory(agentId, memoryId)

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * PATCH /api/agents/:id/memory/long-term
 * Update a memory's content or category
 *
 * Body:
 * - id: Memory ID (required)
 * - content: New content (optional)
 * - category: New category (optional)
 * - context: New context (optional)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const body = await request.json()

  const result = await updateLongTermMemory(agentId, {
    id: body.id,
    content: body.content,
    category: body.category,
    context: body.context,
  })

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
