import { NextResponse } from 'next/server'
import { getSubconsciousStatus } from '@/services/config-service'

// Force dynamic rendering - agent count changes at runtime
export const dynamic = 'force-dynamic'

/**
 * GET /api/subconscious
 * Get the global subconscious status across all agents.
 * Reads from status FILES instead of loading agents into memory.
 */
export async function GET() {
  const result = getSubconsciousStatus()

  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    )
  }

  return NextResponse.json(result.data, { status: result.status })
}
