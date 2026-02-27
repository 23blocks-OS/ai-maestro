/**
 * Creation Helper Chat API
 *
 * POST /api/agents/creation-helper/chat - Send a user message to the helper
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendMessage } from '@/services/creation-helper-service'

export async function POST(request: NextRequest) {
  try {
    let body: { message?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { message } = body
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required and must be a string' }, { status: 400 })
    }

    const result = await sendMessage(message)
    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[CreationHelper] POST chat error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
