import { NextResponse } from 'next/server'
import { getDockerInfo } from '@/services/config-service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/docker/info
 * Check if Docker is available on this host.
 */
export async function GET() {
  const result = await getDockerInfo()
  return NextResponse.json(result.data, { status: result.status })
}
