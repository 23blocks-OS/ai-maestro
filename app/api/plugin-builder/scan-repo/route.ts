/**
 * Plugin Builder - Repo Scanner API
 *
 * POST /api/plugin-builder/scan-repo - Scan a git repo for skills
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { scanRepo } from '@/services/plugin-builder-service'

export async function POST(request: NextRequest) {
  // Parse JSON separately so the catch block can give an accurate error message
  let body: { url?: unknown; ref?: unknown }
  try {
    body = await request.json()
  } catch (jsonError) {
    console.error('Error parsing request body:', jsonError)
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    )
  }

  if (!body.url || typeof body.url !== 'string') {
    return NextResponse.json(
      { error: 'Repository URL is required' },
      { status: 400 }
    )
  }

  // Validate ref type when provided — passing a non-string to scanRepo would
  // bypass the service's own validateGitRef check and cause unexpected behavior
  if (body.ref !== undefined && typeof body.ref !== 'string') {
    return NextResponse.json(
      { error: 'Repository reference (ref) must be a string' },
      { status: 400 }
    )
  }

  const ref = typeof body.ref === 'string' ? body.ref : 'main'

  try {
    const result = await scanRepo(body.url, ref)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (scanError) {
    // scanRepo is designed to return structured errors, but catch any unexpected throws
    console.error('Unexpected error scanning repo:', scanError)
    return NextResponse.json(
      { error: 'Failed to scan repository due to an internal server error' },
      { status: 500 }
    )
  }
}
