/**
 * Plugin Builder - Repo Scanner API
 *
 * POST /api/plugin-builder/scan-repo - Scan a git repo for skills
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { scanRepo } from '@/services/plugin-builder-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Guard against null, primitives, or arrays — property access on these throws TypeError
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    if (!body.url || typeof body.url !== 'string') {
      return NextResponse.json(
        { error: 'Repository URL is required' },
        { status: 400 }
      )
    }

    // Validate ref is a string when provided; non-string values are rejected with a 400 error
    if (body.ref !== undefined && typeof body.ref !== 'string') {
      return NextResponse.json(
        { error: 'Repository reference (ref) must be a string' },
        { status: 400 }
      )
    }

    const result = await scanRepo(body.url, typeof body.ref === 'string' ? body.ref : 'main')

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        // Fall back to 500 if scanRepo omits status, so the response is never a misleading 200
        { status: result.status ?? 500 }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error scanning repo:', error)
    // request.json() throws a SyntaxError when the body is not valid JSON
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }
    // Any other unexpected error is a server-side failure, not a client error
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
