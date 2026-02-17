import { NextResponse } from 'next/server'
import { getPtyDebugInfo } from '@/services/config-service'

// Disable Next.js caching for this endpoint
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/debug/pty
 * Returns PTY usage statistics for monitoring and debugging PTY leaks.
 */
export async function GET() {
  const result = await getPtyDebugInfo()

  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    )
  }

  return NextResponse.json(result.data, { status: result.status })
}
