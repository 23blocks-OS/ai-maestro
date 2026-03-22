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
    // Parse JSON separately so we can return a precise 400 for malformed JSON
    // vs a 500 for errors that originate inside scanRepo (network, GitHub API, etc.)
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
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
    // Assign to a typed variable so TypeScript knows the type is string from here on
    const repoUrl: string = parsed.url

    // Validate that ref, when provided, is a string — not a number, object, etc.
    if (parsed.ref !== undefined && typeof parsed.ref !== 'string') {
      return NextResponse.json(
        { error: 'Repository reference (ref) must be a string if provided' },
        { status: 400 }
      )
    }

    const ref = typeof parsed.ref === 'string' ? parsed.ref : 'main'

    const result = await scanRepo(repoUrl, ref)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // scanRepo threw an unexpected exception (network failure, GitHub API error, etc.)
    console.error('Error scanning repo:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error during repository scan' },
      { status: 500 }
    )
  }
}
