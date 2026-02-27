/**
 * Creation Helper Response API
 *
 * GET /api/agents/creation-helper/response - Capture Claude's latest response
 */

import { NextResponse } from 'next/server'
import { captureResponse } from '@/services/creation-helper-service'

export async function GET() {
  try {
    const result = await captureResponse()
    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[CreationHelper] GET response error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
