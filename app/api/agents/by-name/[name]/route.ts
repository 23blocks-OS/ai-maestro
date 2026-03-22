import { NextRequest, NextResponse } from 'next/server'
import { lookupAgentByName } from '@/services/agents-core-service'

/**
 * GET /api/agents/by-name/[name]
 * Check if an agent exists by name on this host (rich resolution)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { name: string } }
) {
  try {
    const { name } = await params
    // SF-051: Validate name format (alphanumeric, hyphens, underscores only)
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return NextResponse.json({ error: 'Invalid agent name format' }, { status: 400 })
    }
    const result = lookupAgentByName(name)

    if (result.error) {
      return NextResponse.json(result.data || { exists: false }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[By-Name GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
