/**
 * Agent Transfer API
 *
 * POST /api/agents/[id]/transfer — Transfer agent to another AI Maestro instance
 *
 * Thin wrapper — business logic in services/agents-transfer-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { transferAgent } from '@/services/agents-transfer-service'
import { isValidUuid } from '@/lib/validation'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const result = await transferAgent(id, body)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Transfer error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Transfer failed' },
      { status: 500 }
    )
  }
}
