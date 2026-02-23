import { NextResponse } from 'next/server'
import { getUnifiedAgents } from '@/services/agents-core-service'

/**
 * GET /api/agents/unified
 * Aggregates agents from all known hosts.
 *
 * Query params:
 *   - q: Search query (optional)
 *   - includeOffline: Include agents from hosts that failed to respond (default: true)
 *   - timeout: Timeout in ms for host requests (default: 3000)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const result = await getUnifiedAgents({
      query: searchParams.get('q'),
      includeOffline: searchParams.get('includeOffline') !== 'false',
      timeout: parseInt(searchParams.get('timeout') || '3000', 10) || 3000,
    })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Unified Agents GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
