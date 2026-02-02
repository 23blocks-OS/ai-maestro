/**
 * AMP v1 Health Check Endpoint
 *
 * GET /api/v1/health
 *
 * Returns provider health status and basic metrics.
 * No authentication required - used for monitoring and load balancers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { loadAgents } from '@/lib/agent-registry'
import { AMP_PROTOCOL_VERSION, AMP_PROVIDER_NAME } from '@/lib/types/amp'
import type { AMPHealthResponse } from '@/lib/types/amp'

// Track server start time for uptime calculation
const SERVER_START_TIME = Date.now()

export async function GET(_request: NextRequest): Promise<NextResponse<AMPHealthResponse>> {
  try {
    // Count online agents
    const agents = loadAgents()
    const onlineAgents = agents.filter(a =>
      a.sessions?.some(s => s.status === 'online')
    ).length

    // Calculate uptime in seconds
    const uptimeSeconds = Math.floor((Date.now() - SERVER_START_TIME) / 1000)

    const response: AMPHealthResponse = {
      status: 'healthy',
      version: AMP_PROTOCOL_VERSION,
      provider: AMP_PROVIDER_NAME,
      federation: false, // Federation support coming later
      agents_online: onlineAgents,
      uptime_seconds: uptimeSeconds
    }

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
  } catch (error) {
    console.error('[AMP Health] Error:', error)

    const errorResponse: AMPHealthResponse = {
      status: 'unhealthy',
      version: AMP_PROTOCOL_VERSION,
      provider: AMP_PROVIDER_NAME,
      federation: false,
      agents_online: 0,
      uptime_seconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000)
    }

    return NextResponse.json(errorResponse, { status: 503 })
  }
}
