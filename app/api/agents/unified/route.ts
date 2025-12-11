import { NextResponse } from 'next/server'

/**
 * DEPRECATED: /api/agents/unified
 *
 * This endpoint has been consolidated into /api/agents.
 * The new endpoint returns agents with live session status and supports
 * multi-host aggregation via frontend.
 *
 * Redirects to /api/agents with 308 Permanent Redirect.
 */
export async function GET(request: Request) {
  console.warn('[DEPRECATED] /api/agents/unified called - redirecting to /api/agents')

  const url = new URL('/api/agents', request.url)

  // Preserve any query parameters
  const originalUrl = new URL(request.url)
  originalUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value)
  })

  return NextResponse.redirect(url, 308)
}
