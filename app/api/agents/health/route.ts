import { NextResponse } from 'next/server'
import { proxyHealthCheck } from '@/services/agents-core-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agents/health
 * Proxy health check to a remote agent (avoids CORS).
 */
export async function POST(request: Request) {
  try {
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
    // SF-015 fix: Validate URL scheme to prevent SSRF (file://, gopher://, etc.)
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json({ error: 'Only http/https URLs are allowed' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }
    // CC-P3-003: Wrap proxyHealthCheck in try-catch for unexpected throws
    const result = await proxyHealthCheck(url)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
