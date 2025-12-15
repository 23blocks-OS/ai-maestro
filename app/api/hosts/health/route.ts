import { NextRequest, NextResponse } from 'next/server'
import * as http from 'http'
import * as https from 'https'

export const dynamic = 'force-dynamic'

/**
 * GET /api/hosts/health?url=<hostUrl>
 * Proxy health check request to remote host
 *
 * This avoids CORS issues and network accessibility problems
 * when browser tries to fetch directly from remote hosts
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

    // Parse the URL
    let parsedUrl: URL
    try {
      parsedUrl = new URL(hostUrl)
    } catch (err) {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    // Make request to remote host with timeout - also gets session count
    const result = await makeHealthCheckRequest(parsedUrl, 3000)

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
 * Make HTTP/HTTPS health check request with timeout
 * Also extracts session count from /api/sessions response
 */
function makeHealthCheckRequest(
  url: URL,
  timeout: number
): Promise<{ success: boolean; error?: string; sessionCount?: number }> {
  return new Promise((resolve) => {
    const protocol = url.protocol === 'https:' ? https : http

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: '/api/sessions',
      method: 'GET',
      timeout,
      headers: {
        'User-Agent': 'AI-Maestro-Health-Check',
        'Accept': 'application/json'
      }
    }

    const req = protocol.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          // Try to parse session count from response
          let sessionCount: number | undefined
          try {
            const json = JSON.parse(data)
            // Sessions API returns { sessions: [...] }
            if (json.sessions && Array.isArray(json.sessions)) {
              sessionCount = json.sessions.length
            }
          } catch {
            // Failed to parse, but host is still online
          }
          resolve({ success: true, sessionCount })
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}` })
        }
      })
    })

    req.on('timeout', () => {
      req.destroy()
      resolve({ success: false, error: 'Connection timeout' })
    })

    req.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })

    req.end()
  })
}

/**
 * Fetch version info from remote host's /api/config endpoint
 */
function fetchVersionInfo(
  url: URL,
  timeout: number
): Promise<{ version?: string }> {
  return new Promise((resolve) => {
    const protocol = url.protocol === 'https:' ? https : http

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: '/api/config',
      method: 'GET',
      timeout,
      headers: {
        'User-Agent': 'AI-Maestro-Health-Check',
        'Accept': 'application/json'
      }
    }

    const req = protocol.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const config = JSON.parse(data)
          resolve({ version: config.version })
        } catch (err) {
          resolve({})
        }
      })
    })

    req.on('timeout', () => {
      req.destroy()
      resolve({})
    })

    req.on('error', () => {
      resolve({})
    })

    req.end()
  })
}
