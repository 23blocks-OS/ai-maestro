import { NextRequest } from 'next/server'
import { queryEmailIndex } from '@/services/agents-messaging-service'
import { toResponse } from '@/app/api/_helpers'

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
  const { searchParams } = new URL(request.url)

  const result = await queryEmailIndex({
    addressQuery: searchParams.get('address'),
    agentIdQuery: searchParams.get('agentId'),
    federated: searchParams.get('federated') === 'true',
    isFederatedSubQuery: request.headers.get('X-Federated-Query') === 'true',
  })

  return toResponse(result)
}
