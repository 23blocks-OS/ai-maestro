/**
 * Agent Directory Lookup API
 *
 * GET /api/agents/directory/lookup/[name]
 *   Looks up an agent by name in the directory
 *   Returns the host location and AMP address if found
 *
 * Thin wrapper — business logic in services/agents-directory-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { lookupAgentByDirectoryName } from '@/services/agents-directory-service'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params
  const result = lookupAgentByDirectoryName(name)
  if (result.error) {
    return NextResponse.json({ found: false }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
