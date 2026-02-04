/**
 * AMP Well-Known Discovery Endpoint
 *
 * GET /.well-known/agent-messaging.json
 *
 * Returns provider discovery information for external agents.
 * This is the standard AMP discovery mechanism per protocol spec.
 *
 * External agents use this endpoint to:
 * 1. Discover if this host is an AMP provider
 * 2. Get the API endpoint for registration
 * 3. Get the provider's public key (for signature verification)
 */

import { NextRequest, NextResponse } from 'next/server'
import { AMP_PROTOCOL_VERSION, getAMPProviderDomain } from '@/lib/types/amp'
import { getSelfHost, getSelfHostId, getOrganization } from '@/lib/hosts-config-server.mjs'

interface WellKnownResponse {
  version: string
  endpoint: string
  provider: string
  public_key?: string
  fingerprint?: string
  capabilities: string[]
  contact?: string
}

export async function GET(_request: NextRequest): Promise<NextResponse<WellKnownResponse>> {
  const selfHost = getSelfHost()
  const selfHostId = getSelfHostId()

  // Get organization from hosts config for dynamic provider domain
  const organization = getOrganization() || undefined
  const providerDomain = getAMPProviderDomain(organization)

  // Determine the endpoint URL
  // In production, this should be the externally accessible URL
  const endpoint = selfHost?.url
    ? `${selfHost.url}/api/v1`
    : `http://localhost:23000/api/v1`

  const response: WellKnownResponse = {
    version: `AMP${AMP_PROTOCOL_VERSION.replace('.', '')}`, // AMP010 format
    endpoint,
    provider: `${selfHostId}.${providerDomain}`,

    // Provider-level public key (for signing federation requests)
    // TODO: Implement provider-level keypair
    public_key: undefined,
    fingerprint: undefined,

    // Supported features
    capabilities: [
      'registration',       // Agent registration via /v1/register
      'local-delivery',     // Local delivery to agents
      'relay-queue',        // Store-and-forward for offline agents
      'mesh-routing',       // Cross-host routing within local network
      // 'federation',      // Cross-provider routing (planned)
      // 'websockets',      // Real-time delivery (planned)
    ],

    // Contact for the provider admin (optional)
    contact: undefined
  }

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'Access-Control-Allow-Origin': '*', // Allow discovery from any origin
    }
  })
}
