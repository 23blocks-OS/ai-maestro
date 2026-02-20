import { NextRequest, NextResponse } from 'next/server'
import { lookupAgentByName } from '@/services/agents-core-service'

/**
 * GET /api/agents/by-name/[name]
 * Check if an agent exists by name on this host (rich resolution)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params
  const result = lookupAgentByName(name)

  if (result.error) {
    return NextResponse.json(result.data || { exists: false }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
