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

    // Validate ref type before passing to scanRepo (body is untyped from JSON)
    const ref = typeof body.ref === 'string' && body.ref ? body.ref : 'main'
    const result = await scanRepo(body.url, ref)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        // Fallback to 500 in case status is missing on the result object
        { status: result.status || 500 }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error scanning repo:', error)
    // SyntaxError is thrown by request.json() for malformed request bodies
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    // All other unexpected errors are server-side failures, not client faults
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
