import { NextRequest, NextResponse } from 'next/server'
import { queryEmailIndex } from '@/services/agents-messaging-service'

/**
 * GET /api/agents/email-index
 *
 * Returns a mapping of email addresses to agent identity.
 * Used by external gateways to build routing tables.
 *
 * Query parameters:
 *   ?address=email@example.com - Lookup single address
 *   ?agentId=uuid-123 - Get all addresses for an agent
 *   ?federated=true - Query all known hosts (not just local)
 */
export async function GET(request: NextRequest) {
  try {
    // NT-027: Use request.nextUrl.searchParams for consistent URL parsing
    const searchParams = request.nextUrl.searchParams

    const result = await queryEmailIndex({
      addressQuery: searchParams.get('address'),
      agentIdQuery: searchParams.get('agentId'),
      federated: searchParams.get('federated') === 'true',
      isFederatedSubQuery: request.headers.get('X-Federated-Query') === 'true',
    })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // SF-046: Outer try-catch for unhandled service throws
    console.error('[Email Index GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
