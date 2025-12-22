import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/hosts/health?url=<hostUrl>
 * Proxy health check request to remote host
 *
 * Uses native fetch (undici) which works correctly with Tailscale/VPN networks.
 * Note: Node.js http.request module has issues with Tailscale networks.
 *
 * Returns: { success, status, url, version?, sessionCount? }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const hostUrl = searchParams.get('url')

    if (!hostUrl) {
      return NextResponse.json(
        { error: 'url query parameter is required' },
        { status: 400 }
      )
    }

    // Validate URL format
    let parsedUrl: URL
    try {
      parsedUrl = new URL(hostUrl)
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    // Make health check request using fetch
    // Note: /api/sessions can take 5+ seconds on remote hosts due to tmux queries
    const result = await makeHealthCheckRequest(parsedUrl, 10000)

    if (result.success) {
      // Also fetch version info from /api/config
      const versionResult = await fetchVersionInfo(parsedUrl, 3000)

      return NextResponse.json({
        success: true,
        status: 'online',
        url: hostUrl,
        version: versionResult.version || null,
        sessionCount: result.sessionCount ?? null
      })
    } else {
      return NextResponse.json({
        success: false,
        status: 'offline',
        url: hostUrl,
        error: result.error
      }, { status: 503 })
    }
  } catch (error) {
    console.error('[Health API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        status: 'offline',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * Make health check request using native fetch
 * Also extracts session count from /api/sessions response
 */
async function makeHealthCheckRequest(
  url: URL,
  timeout: number
): Promise<{ success: boolean; error?: string; sessionCount?: number }> {
  try {
    const sessionsUrl = `${url.protocol}//${url.host}/api/sessions`

    const response = await fetch(sessionsUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'AI-Maestro-Health-Check',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(timeout)
    })

    if (response.ok || response.status < 500) {
      // Try to parse session count from response
      let sessionCount: number | undefined
      try {
        const json = await response.json()
        // Sessions API returns { sessions: [...] }
        if (json.sessions && Array.isArray(json.sessions)) {
          sessionCount = json.sessions.length
        }
      } catch {
        // Failed to parse, but host is still online
      }
      return { success: true, sessionCount }
    } else {
      return { success: false, error: `HTTP ${response.status}` }
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        return { success: false, error: 'Connection timeout' }
      }
      return { success: false, error: error.message }
    }
    return { success: false, error: 'Unknown error' }
  }
}

/**
 * Fetch version info from remote host's /api/config endpoint
 */
async function fetchVersionInfo(
  url: URL,
  timeout: number
): Promise<{ version?: string }> {
  try {
    const configUrl = `${url.protocol}//${url.host}/api/config`

    const response = await fetch(configUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'AI-Maestro-Health-Check',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(timeout)
    })

    if (response.ok) {
      const config = await response.json()
      return { version: config.version }
    }
    return {}
  } catch {
    return {}
  }
}
