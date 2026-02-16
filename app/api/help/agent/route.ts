/**
 * Help Agent API
 *
 * POST /api/help/agent - Create or return existing AI Maestro assistant agent
 * DELETE /api/help/agent - Kill the assistant agent and clean up
 * GET /api/help/agent - Check assistant agent status
 */

import { NextResponse } from 'next/server'
import {
  createAssistantAgent,
  deleteAssistantAgent,
  getAssistantStatus,
} from '@/services/help-service'

/**
 * POST - Create or return existing assistant agent
 */
export async function POST() {
  const result = await createAssistantAgent()

  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data)
}

/**
 * DELETE - Kill assistant agent and clean up
 */
export async function DELETE() {
  const result = await deleteAssistantAgent()

  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data)
}

/**
 * GET - Check assistant agent status
 */
export async function GET() {
  const result = await getAssistantStatus()

  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data)
}
