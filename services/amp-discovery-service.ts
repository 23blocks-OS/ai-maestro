/**
 * AMP well-known discovery document (GET /.well-known/agent-messaging.json).
 *
 * External agents use it to discover whether this host is an AMP provider, the
 * API endpoint for registration and the provider's public key. Moved out of the
 * Next route so the headless router serves the same function (B012).
 */

import { AMP_PROTOCOL_VERSION, getAMPProviderDomain } from '@/lib/types/amp'
import { getSelfHost, getSelfHostId, getOrganization } from '@/lib/hosts-config-server.mjs'
import type { ServiceResult } from '@/services/service-errors'

export interface WellKnownResponse {
  version: string
  endpoint: string
  provider: string
  public_key?: string
  fingerprint?: string
  capabilities: string[]
  contact?: string
}

export function getWellKnownDocument(): ServiceResult<WellKnownResponse> {
  const selfHost = getSelfHost()
  const selfHostId = getSelfHostId()

  // Organization from hosts config for a dynamic provider domain
  const organization = getOrganization() || undefined
  const providerDomain = getAMPProviderDomain(organization)

  // In production this should be the externally accessible URL
  const endpoint = selfHost?.url ? `${selfHost.url}/api/v1` : `http://localhost:23000/api/v1`

  return {
    data: {
      version: `AMP${AMP_PROTOCOL_VERSION.replace('.', '')}`, // AMP010 format
      endpoint,
      provider: `${selfHostId}.${providerDomain}`,

      // Provider-level public key (for signing federation requests)
      // TODO: Implement provider-level keypair
      public_key: undefined,
      fingerprint: undefined,

      capabilities: [
        'registration',       // Agent registration via /v1/register
        'local-delivery',     // Local delivery to agents
        'relay-queue',        // Store-and-forward for offline agents
        'mesh-routing',       // Cross-host routing within local network
        // 'federation',      // Cross-provider routing (planned)
        // 'websockets',      // Real-time delivery (planned)
      ],

      contact: undefined,
    },
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'Access-Control-Allow-Origin': '*', // Allow discovery from any origin
    },
  }
}
