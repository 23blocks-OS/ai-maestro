/**
 * AMP v1 Agent Address Resolution
 *
 * GET /api/v1/agents/resolve/:address — Resolve agent address to public key
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/amp-auth'
import { getAgentByNameAnyHost, loadAgents } from '@/lib/agent-registry'
import { loadKeyPair } from '@/lib/amp-keys'
import type { AMPError, AMPAgentResolveResponse } from '@/lib/types/amp'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const authHeader = request.headers.get('Authorization')
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return NextResponse.json({
      error: auth.error || 'unauthorized',
      message: auth.message || 'Authentication required'
    } as AMPError, { status: 401 })
  }

  const { address } = await params
  const decodedAddress = decodeURIComponent(address)

  // Extract agent name from address (name@domain)
  const atIndex = decodedAddress.indexOf('@')
  const agentName = atIndex >= 0 ? decodedAddress.substring(0, atIndex) : decodedAddress

  // Find agent by name
  const agent = getAgentByNameAnyHost(agentName)

  if (!agent) {
    // Also try searching all agents by AMP address metadata
    const allAgents = loadAgents()
    const byAddress = allAgents.find(a =>
      a.metadata?.amp?.address === decodedAddress
    )
    if (!byAddress) {
      return NextResponse.json({
        error: 'not_found',
        message: `Agent not found: ${decodedAddress}`
      } as AMPError, { status: 404 })
    }

    const keyPair = loadKeyPair(byAddress.id)
    const response: AMPAgentResolveResponse = {
      address: decodedAddress,
      alias: byAddress.alias || byAddress.label,
      public_key: keyPair?.publicPem || '',
      key_algorithm: 'Ed25519',
      fingerprint: keyPair?.fingerprint || (byAddress.metadata?.amp?.fingerprint as string) || '',
      online: byAddress.sessions?.some(s => s.status === 'online') || false,
    }
    return NextResponse.json(response)
  }

  const keyPair = loadKeyPair(agent.id)
  const ampAddress = (agent.metadata?.amp?.address as string) || decodedAddress

  const response: AMPAgentResolveResponse = {
    address: ampAddress,
    alias: agent.alias || agent.label,
    public_key: keyPair?.publicPem || '',
    key_algorithm: 'Ed25519',
    fingerprint: keyPair?.fingerprint || (agent.metadata?.amp?.fingerprint as string) || '',
    online: agent.sessions?.some(s => s.status === 'online') || false,
  }

  return NextResponse.json(response)
}
