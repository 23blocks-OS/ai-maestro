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

    // Make request to remote host with timeout
    const result = await makeHealthCheckRequest(parsedUrl, 3000)

    if (result.success) {
      return NextResponse.json({
        success: true,
        status: 'online',
        url: hostUrl
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
 */
function makeHealthCheckRequest(
  url: URL,
  timeout: number
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const protocol = url.protocol === 'https:' ? https : http

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: '/api/sessions',
      method: 'GET',
      timeout,
      headers: {
        'User-Agent': 'AI-Maestro-Health-Check'
      }
    }

    const req = protocol.request(options, (res) => {
      // Don't need to read the body, just check if we got a response
      res.resume() // Consume response data to free up memory

      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: `HTTP ${res.statusCode}` })
      }
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
