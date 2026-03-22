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

    if (!body.url || typeof body.url !== 'string') {
      return NextResponse.json(
        { error: 'Repository URL is required' },
        { status: 400 }
      )
    }

    // Validate ref is a string when provided — scanRepo expects string
    if (body.ref !== undefined && typeof body.ref !== 'string') {
      return NextResponse.json(
        { error: 'Repository reference (ref) must be a string' },
        { status: 400 }
      )
    }
    const ref: string = typeof body.ref === 'string' ? body.ref : 'main'

    const result = await scanRepo(body.url, ref)

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
    console.error('Error scanning repo:', error)
    // JSON parse errors from request.json() are SyntaxErrors — return 400
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    // All other unexpected errors are server-side failures — return 500
    return NextResponse.json(
      { error: 'An unexpected server error occurred' },
      { status: 500 }
    )
  }
}
