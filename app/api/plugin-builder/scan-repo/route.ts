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
    // Parse JSON separately so parse failures are always reported as 400,
    // before any business-logic validation or service calls run.
    body = await request.json()
  } catch (error) {
    // SyntaxError is thrown by request.json() when the body is not valid JSON
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    // Any other unexpected error during body parsing is a server-side failure
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }

  const bodyObj = body as Record<string, unknown>

  if (!bodyObj.url || typeof bodyObj.url !== 'string') {
    return NextResponse.json(
      { error: 'Repository URL is required' },
      { status: 400 }
    )
  }

  try {
    // Errors thrown by scanRepo are unexpected server errors, not client errors
    const result = await scanRepo(bodyObj.url, typeof bodyObj.ref === 'string' ? bodyObj.ref : 'main')

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('Error scanning repo:', error)
    return NextResponse.json(
      { error: 'Internal server error during repository scan' },
      { status: 500 }
    )
  }
}
