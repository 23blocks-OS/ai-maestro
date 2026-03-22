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

    // Reject non-string ref values early so scanRepo always receives a string.
    if (body.ref !== undefined && typeof body.ref !== 'string') {
      return NextResponse.json(
        { error: 'Repository reference (ref) must be a string' },
        { status: 400 }
      )
    }

    const result = await scanRepo(body.url, body.ref || 'main')

    if (result.error) {
      // Validate the status code is a legitimate HTTP status before forwarding it;
      // fall back to 500 if the service returned a value outside the valid range.
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
    // SyntaxError thrown by request.json() means the client sent malformed JSON.
    if (error instanceof SyntaxError) {
      console.error('Error parsing request body:', error)
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }
    // Any other exception is an unexpected internal server error, not a client mistake.
    console.error('Unexpected error scanning repo:', error)
    const message = error instanceof Error ? error.message : 'An unknown error occurred'
    return NextResponse.json(
      { error: `Internal server error: ${message}` },
      { status: 500 }
    )
  }
}
