/**
 * AMP v1 Provider Info Endpoint
 *
 * GET /api/v1/info
 *
 * Returns provider information including capabilities, registration modes,
 * and rate limits. No authentication required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { AMP_PROTOCOL_VERSION, AMP_PROVIDER_NAME } from '@/lib/types/amp'
import type { AMPInfoResponse } from '@/lib/types/amp'

export async function GET(_request: NextRequest): Promise<NextResponse<AMPInfoResponse>> {
  const response: AMPInfoResponse = {
    provider: AMP_PROVIDER_NAME,
    version: `amp/${AMP_PROTOCOL_VERSION}`,

    // Provider-level public key (optional - for federation signing)
    // For now, we don't have provider-level keys
    public_key: undefined,
    fingerprint: undefined,

    // Supported features
    capabilities: [
      'registration',       // Agent registration via /v1/register
      'local-delivery',     // Local agent delivery via file system + tmux notification
      'relay-queue',        // Store-and-forward for offline agents
      'mesh-routing',       // Cross-host routing within local network
      // 'webhooks',        // Webhook delivery (planned)
      // 'federation',      // Provider-to-provider routing (planned)
      // 'websockets',      // Real-time WebSocket delivery (planned)
    ],

    // How agents can register
    registration_modes: [
      'open'  // Anyone can register (localhost only, no external access)
    ],

    // Rate limits (per agent, per minute)
    rate_limits: {
      messages_per_minute: 60,
      api_requests_per_minute: 100
    }
  }

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
    }
  })
}
