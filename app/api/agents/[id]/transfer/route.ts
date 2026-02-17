/**
 * Agent Transfer API
 *
 * POST /api/agents/[id]/transfer — Transfer agent to another AI Maestro instance
 *
 * Thin wrapper — business logic in services/agents-transfer-service.ts
 */

import { NextResponse } from 'next/server'
import { transferAgent } from '@/services/agents-transfer-service'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const result = await transferAgent(params.id, body)

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
