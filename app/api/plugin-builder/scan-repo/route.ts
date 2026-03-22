/**
 * Plugin Builder - Repo Scanner API
 *
 * POST /api/plugin-builder/scan-repo - Scan a git repo for skills
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { scanRepo } from '@/services/plugin-builder-service'

export async function POST(request: NextRequest) {
  // SF-004: Separate JSON parsing from service call so service errors
  // are not misattributed as "Invalid request body" (400)
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch (error) {
    // JSON parse errors from request.json() are SyntaxErrors — return 400
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'An unexpected server error occurred' },
      { status: 500 }
    )
  }

  if (!body.url || typeof body.url !== 'string') {
    return NextResponse.json(
      { error: 'Repository URL is required' },
      { status: 400 }
    )
  }

  // SF-006: Validate body.ref is undefined or a string before passing to service
  if (body.ref !== undefined && typeof body.ref !== 'string') {
    return NextResponse.json(
      { error: 'ref must be a string if provided' },
      { status: 400 }
    )
  }

  try {
    const result = await scanRepo(body.url as string, (body.ref as string) || 'main')

    if (result.error) {
      // Validate the status code is a proper HTTP status before using it
      const statusCode =
        typeof result.status === 'number' && result.status >= 100 && result.status < 600
          ? result.status
          : 500
      return NextResponse.json(
        { error: result.error },
        { status: statusCode }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // Unexpected server-side error — not a client input problem
    console.error('Error scanning repo:', error)
    // All unexpected service errors are server-side failures — return 500
    return NextResponse.json(
      { error: 'An unexpected server error occurred' },
      { status: 500 }
    )
  }
}
