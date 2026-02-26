import { NextRequest, NextResponse } from 'next/server'
import {
  queryLongTermMemories,
  deleteLongTermMemory,
  updateLongTermMemory,
} from '@/services/agents-memory-service'
import type { MemoryCategory } from '@/lib/cozo-schema-memory'
import { isValidUuid } from '@/lib/validation'

// SF-020: Allowed MemoryCategory values for runtime validation
const VALID_CATEGORIES: readonly string[] = ['fact', 'decision', 'preference', 'pattern', 'insight', 'reasoning']
// SF-021: Allowed tier values for runtime validation
const VALID_TIERS: readonly string[] = ['warm', 'long']

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
  try {
    const { id: agentId } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const searchParams = request.nextUrl.searchParams

    // SF-020: Validate category against allowed MemoryCategory values
    const categoryParam = searchParams.get('category')
    if (categoryParam && !VALID_CATEGORIES.includes(categoryParam)) {
      return NextResponse.json({ error: `Invalid category parameter. Allowed: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 })
    }

    // SF-021: Validate tier against allowed values
    const tierParam = searchParams.get('tier')
    if (tierParam && !VALID_TIERS.includes(tierParam)) {
      return NextResponse.json({ error: `Invalid tier parameter. Allowed: ${VALID_TIERS.join(', ')}` }, { status: 400 })
    }

    const result = await queryLongTermMemories(agentId, {
      query: searchParams.get('query'),
      category: categoryParam as MemoryCategory | null,
      limit: parseInt(searchParams.get('limit') || '20', 10) || 20,
      includeRelated: searchParams.get('includeRelated') === 'true',
      minConfidence: (() => { const mc = parseFloat(searchParams.get('minConfidence') || '0'); return isNaN(mc) ? 0 : Math.max(0, Math.min(1, mc)) })(),
      tier: tierParam as 'warm' | 'long' | null,
      view: searchParams.get('view'),
      memoryId: searchParams.get('id'),
      maxTokens: parseInt(searchParams.get('maxTokens') || '2000', 10) || 2000,
    })

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Long-Term Memory GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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
  try {
    const { id: agentId } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const memoryId = request.nextUrl.searchParams.get('id') || ''

    const result = await deleteLongTermMemory(agentId, memoryId)

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Long-Term Memory DELETE] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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
  try {
    const { id: agentId } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    }

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
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Long-Term Memory PATCH] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
