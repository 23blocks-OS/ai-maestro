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
    // Type as unknown so TypeScript forces explicit validation before any property access.
    // request.json() returns valid JSON which can be null, a primitive, an array, etc.
    // Accessing .url on those would throw a TypeError that is NOT a SyntaxError, so it
    // would silently produce a 500 instead of the correct 400 without this guard.
    const body: unknown = await request.json()

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Request body must be a JSON object' },
        { status: 400 }
      )
    }

    const { url, ref } = body as Record<string, unknown>

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'Repository URL is required' },
        { status: 400 }
      )
    }

    // Validate ref is a string if provided — scanRepo expects string, not arbitrary types
    if (ref !== undefined && typeof ref !== 'string') {
      return NextResponse.json(
        { error: 'Repository reference (ref) must be a string' },
        { status: 400 }
      )
    }

    const result = await scanRepo(url, ref || 'main')

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error scanning repo:', error)
    // SyntaxError is thrown by request.json() when the body is malformed JSON — 400 is correct
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Malformed JSON in request body' },
        { status: 400 }
      )
    }
    // Any other unexpected error is a server-side fault — use 500
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
