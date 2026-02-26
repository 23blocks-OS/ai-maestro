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
  try {
    const result = await createAssistantAgent()

    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[HelpAgent] POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE - Kill assistant agent and clean up
 */
export async function DELETE() {
  try {
    const result = await deleteAssistantAgent()

    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[HelpAgent] DELETE error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET - Check assistant agent status
 */
export async function GET() {
  try {
    const result = await getAssistantStatus()

    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[HelpAgent] GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
