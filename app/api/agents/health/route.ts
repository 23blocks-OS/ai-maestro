import { NextResponse } from 'next/server'
import { proxyHealthCheck } from '@/services/agents-core-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agents/health
 * Proxy health check to a remote agent (avoids CORS).
 */
export async function POST(request: Request) {
  const { url } = await request.json()
  const result = await proxyHealthCheck(url)

  if (result.error) {
    return NextResponse.json(
      { error: result.error, details: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data)
}
