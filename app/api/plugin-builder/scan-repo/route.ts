/**
 * Plugin Builder - Repo Scanner API
 *
 * POST /api/plugin-builder/scan-repo - Scan a git repo for skills
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { scanRepo } from '@/services/plugin-builder-service'

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    // request.json() throws a SyntaxError when the body is not valid JSON
    console.error('Error parsing request body:', error)
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  try {
    const parsed = body as Record<string, unknown>

    if (!parsed.url || typeof parsed.url !== 'string') {
      return NextResponse.json(
        { error: 'Repository URL is required' },
        { status: 400 }
      )
    }

    // Validate ref if provided — must be a string
    if (parsed.ref !== undefined && typeof parsed.ref !== 'string') {
      return NextResponse.json(
        { error: 'Repository reference (ref) must be a string if provided' },
        { status: 400 }
      )
    }

    const result = await scanRepo(parsed.url, parsed.ref || 'main')

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // Unexpected server-side error — not a client input problem
    console.error('Error scanning repo:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
