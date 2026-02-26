import { NextResponse } from 'next/server'
import { proxyHealthCheck } from '@/services/agents-core-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agents/health
 * Proxy health check to a remote agent (avoids CORS).
 */
export async function POST(request: Request) {
  try {
    let body: { url?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { url } = body
    // Validate url is present and is a string before proxying
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required and must be a string' }, { status: 400 })
    }
    // Validate URL scheme and hostname to prevent SSRF
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json({ error: 'Only http/https URLs are allowed' }, { status: 400 })
      }
      // SF-013 fix: Block private/internal IPs to prevent SSRF probing
      const hostname = parsed.hostname.toLowerCase()
      const isPrivateHost =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '0.0.0.0' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('169.254.') ||
        hostname.startsWith('fc00:') ||
        hostname.startsWith('fd') ||
        hostname.startsWith('fe80:') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal')
      if (isPrivateHost) {
        return NextResponse.json({ error: 'Requests to private/internal addresses are not allowed' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }
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
