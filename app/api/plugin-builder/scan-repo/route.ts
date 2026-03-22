/**
 * Plugin Builder - Repo Scanner API
 *
 * POST /api/plugin-builder/scan-repo - Scan a git repo for skills
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { scanRepo } from '@/services/plugin-builder-service'

export async function POST(request: NextRequest) {
  // Parse the request body separately so JSON parse failures (client error)
  // are reported as 400, distinct from internal errors from scanRepo (500).
  let body: { url?: unknown; ref?: unknown }
  try {
    body = await request.json()
  } catch (error) {
    // request.json() throws a SyntaxError when the body is not valid JSON — that is a client error (400).
    // Any other exception here is an unexpected server fault (500).
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    console.error('Unhandled error in POST /api/plugin-builder/scan-repo:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }

  if (!body.url || typeof body.url !== 'string') {
    return NextResponse.json(
      { error: 'Repository URL is required' },
      { status: 400 }
    )
  }

  try {
    const ref = typeof body.ref === 'string' ? body.ref : 'main'
    const result = await scanRepo(body.url, ref)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // Unexpected error from scanRepo or response construction — this is a server fault.
    console.error('Error scanning repo:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
