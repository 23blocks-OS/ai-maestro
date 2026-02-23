import { NextRequest, NextResponse } from 'next/server'
import { checkRemoteHealth } from '@/services/hosts-service'
import { getHosts } from '@/lib/hosts-config'

export const dynamic = 'force-dynamic'

/**
 * GET /api/hosts/health?url=<hostUrl>
 *
 * Proxy health check request to remote host.
 */
export async function GET(request: NextRequest) {
  const hostUrl = request.nextUrl.searchParams.get('url') || ''

  // MF-001: SSRF protection — allowlist approach. Only allow URLs whose hostname
  // matches a known host in hosts.json. The old blocklist was bypassable via
  // octal/hex/decimal/IPv6-mapped IP representations.
  if (hostUrl) {
    try {
      const parsed = new URL(hostUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json({ error: 'Only http/https URLs are allowed' }, { status: 400 })
      }
      // Allowlist: only permit health checks to hosts registered in hosts.json
      const knownHosts = getHosts()
      // MF-001 fix: Compare origin (protocol+hostname+port) instead of just hostname
      // to prevent SSRF to arbitrary ports on known hosts (e.g. Redis :6379, Postgres :5432)
      const requestOrigin = parsed.origin.toLowerCase()
      const isKnownHost = knownHosts.some(host => {
        // Check the host's configured URL by origin (protocol+hostname+port)
        try {
          const hostParsed = new URL(host.url)
          if (hostParsed.origin.toLowerCase() === requestOrigin) return true
        } catch { /* skip malformed host URLs */ }
        // Check all known aliases (IPs, hostnames, URLs)
        if (host.aliases) {
          for (const alias of host.aliases) {
            // Alias can be an IP, hostname, or full URL
            try {
              const aliasParsed = new URL(alias.includes('://') ? alias : `http://${alias}`)
              if (aliasParsed.origin.toLowerCase() === requestOrigin) return true
            } catch { /* skip malformed aliases */ }
            // Direct string match for bare hostnames/IPs -- compare against hostname
            // (bare aliases have no port info, so hostname match is acceptable here)
            if (alias.toLowerCase() === parsed.hostname.toLowerCase()) return true
          }
        }
        return false
      })
      if (!isKnownHost) {
        return NextResponse.json({ error: 'Host not in allowlist — only registered hosts can be health-checked' }, { status: 403 })
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
