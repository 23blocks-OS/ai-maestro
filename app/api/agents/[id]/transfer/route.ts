/**
 * Agent Transfer API
 *
 * POST /api/agents/[id]/transfer — Transfer agent to another AI Maestro instance
 *
 * Thin wrapper — business logic in services/agents-transfer-service.ts
 */

import { NextResponse } from 'next/server'
import { transferAgent } from '@/services/agents-transfer-service'
import { toResponse } from '@/app/api/_helpers'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const result = await transferAgent(params.id, body)
    return toResponse(result)
  } catch (error) {
    console.error('Transfer error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Transfer failed' },
      { status: 500 }
    )
  }
}
