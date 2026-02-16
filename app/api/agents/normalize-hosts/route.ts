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
  const result = diagnoseHosts()
  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

export async function POST() {
  const result = normalizeHosts()
  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
