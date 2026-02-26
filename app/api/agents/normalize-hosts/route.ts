/**
 * Agent Host ID Normalization API
 *
 * GET /api/agents/normalize-hosts
 *   Returns diagnostic information about host ID inconsistencies
 *
 * POST /api/agents/normalize-hosts
 *   Normalizes all agent hostIds to canonical format
 *
 * Thin wrapper — business logic in services/agents-directory-service.ts
 */

import { NextResponse } from 'next/server'
import { diagnoseHosts, normalizeHosts } from '@/services/agents-directory-service'

export async function GET() {
  try {
    const result = diagnoseHosts()
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-018: Outer try-catch for unhandled service throws
    console.error('[Normalize Hosts GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const result = await normalizeHosts()
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-018: Outer try-catch for unhandled service throws
    console.error('[Normalize Hosts POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
