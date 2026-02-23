import { NextResponse } from 'next/server'
import { getHostIdentity } from '@/services/hosts-service'

// Force dynamic rendering - organization can change at runtime
export const dynamic = 'force-dynamic'

/**
 * GET /api/hosts/identity
 *
 * Returns this host's identity information for peer registration.
 */
export async function GET() {
  const result = getHostIdentity()
  // SF-013 fix: Check for error in result before returning data
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
