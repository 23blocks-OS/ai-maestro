/**
 * Agent Directory API
 *
 * GET /api/agents/directory
 *   Returns the agent directory for this host
 *   Used by peer hosts to sync agent locations
 *
 * Thin wrapper — business logic in services/agents-directory-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDirectory } from '@/services/agents-directory-service'

export async function GET(_request: NextRequest) {
  try {
    const result = getDirectory()
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-016: Outer try-catch for unhandled service throws
    console.error('[Directory GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
