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

    // Validate ref type: if provided it must be a string, not a number/object/etc.
    if (body.ref != null && typeof body.ref !== 'string') {
      return NextResponse.json(
        { error: 'Repository ref must be a string' },
        { status: 400 }
      )
    }

    const result = await scanRepo(body.url, body.ref || 'main')

    // Guard against null/undefined or error result from scanRepo
    if (!result || result.error) {
      return NextResponse.json(
        { error: result?.error ?? 'Scan failed' },
        { status: result?.status ?? 500 }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // JSON parse errors from request.json() are client mistakes → 400
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }
    // Any other thrown error is an unexpected server-side failure → 500
    console.error('Error scanning repo:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
