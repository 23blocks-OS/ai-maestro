import { NextResponse } from 'next/server'
import { proxyHealthCheck } from '@/services/agents-core-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agents/health
 * Proxy health check to a remote agent (avoids CORS).
 */
export async function POST(request: Request) {
  // CC-P1-606: Guard against malformed JSON body
  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { url } = body
  // CC-P2-010: Validate url is present and is a string before proxying
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required and must be a string' }, { status: 400 })
  }
  const result = await proxyHealthCheck(url)

  if (result.error) {
    return NextResponse.json(
      { error: result.error, details: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data)
}
