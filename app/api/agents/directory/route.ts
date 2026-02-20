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
  const result = getDirectory()
  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
