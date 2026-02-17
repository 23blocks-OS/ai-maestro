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
  const { searchParams } = new URL(request.url)

  const result = await getUnifiedAgents({
    query: searchParams.get('q'),
    includeOffline: searchParams.get('includeOffline') !== 'false',
    timeout: parseInt(searchParams.get('timeout') || '3000', 10),
  })

  return NextResponse.json(result.data)
}
