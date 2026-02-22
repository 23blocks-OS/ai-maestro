import { NextRequest, NextResponse } from 'next/server'
import { checkRemoteHealth } from '@/services/hosts-service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/hosts/health?url=<hostUrl>
 *
 * Proxy health check request to remote host.
 */
export async function GET(request: NextRequest) {
  const hostUrl = request.nextUrl.searchParams.get('url') || ''

  // SF-056: SSRF protection — reject non-HTTP schemes and private/reserved IP destinations.
  // Phase 1 is localhost-only so risk is low, but defense-in-depth is applied here.
  if (hostUrl) {
    try {
      const parsed = new URL(hostUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json({ error: 'Only http/https URLs are allowed' }, { status: 400 })
      }
      // Block private/reserved IP ranges to prevent SSRF against internal services
      const hostname = parsed.hostname
      const isPrivate =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '0.0.0.0' ||
        /^10\./.test(hostname) ||
        /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^169\.254\./.test(hostname) ||
        hostname.endsWith('.local')
      if (isPrivate) {
        return NextResponse.json({ error: 'URLs targeting private/reserved addresses are not allowed' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }
  }

  const result = await checkRemoteHealth(hostUrl)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
