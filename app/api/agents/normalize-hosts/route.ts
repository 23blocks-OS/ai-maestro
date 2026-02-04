/**
 * Agent Host ID Normalization API
 *
 * GET /api/agents/normalize-hosts
 *   Returns diagnostic information about host ID inconsistencies
 *
 * POST /api/agents/normalize-hosts
 *   Normalizes all agent hostIds to canonical format
 *
 * This endpoint is part of Phase 1 of the AMP Protocol Fix:
 * - Normalizes legacy 'local' hostId to actual hostname
 * - Normalizes mixed case hostIds (e.g., 'Juans-MacBook-Pro' -> 'juans-macbook-pro')
 * - Strips .local suffix (e.g., 'juans-macbook-pro.local' -> 'juans-macbook-pro')
 */

import { NextResponse } from 'next/server'
import {
  diagnoseHostIds,
  normalizeAllAgentHostIds,
} from '@/lib/agent-registry'

/**
 * GET /api/agents/normalize-hosts
 *
 * Returns diagnostic information about host ID inconsistencies
 */
export async function GET() {
  try {
    const diagnosis = diagnoseHostIds()

    return NextResponse.json({
      success: true,
      diagnosis,
      message: diagnosis.agentsNeedingNormalization > 0
        ? `${diagnosis.agentsNeedingNormalization} agents need host ID normalization. Use POST to fix.`
        : 'All agent host IDs are in canonical format.',
    })
  } catch (error) {
    console.error('[Normalize Hosts API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/agents/normalize-hosts
 *
 * Normalizes all agent hostIds to canonical format
 */
export async function POST() {
  try {
    const result = normalizeAllAgentHostIds()

    return NextResponse.json({
      success: true,
      result,
      message: result.updated > 0
        ? `Normalized ${result.updated} agent host IDs`
        : 'No agents needed normalization',
    })
  } catch (error) {
    console.error('[Normalize Hosts API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
