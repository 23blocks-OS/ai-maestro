import { NextRequest, NextResponse } from 'next/server'
import { wakeAgent } from '@/services/agents-core-service'

/**
 * POST /api/agents/[id]/wake
 * Wake a hibernated agent
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Parse optional body
  let startProgram = true
  let sessionIndex = 0
  let program: string | undefined
  try {
    const body = await request.json()
    console.log(`[Wake] Received body:`, JSON.stringify(body))
    if (body.startProgram === false) {
      startProgram = false
    }
    if (typeof body.sessionIndex === 'number') {
      sessionIndex = body.sessionIndex
    }
    if (typeof body.program === 'string') {
      program = body.program.toLowerCase()
      console.log(`[Wake] Program override set to: ${program}`)
    }
  } catch (e) {
    console.log(`[Wake] No body or invalid JSON, using defaults. Error:`, e)
  }

  const result = await wakeAgent(id, { startProgram, sessionIndex, program })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
