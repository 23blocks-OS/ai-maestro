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

    // Validate optional ref field: if provided, it must be a string
    if (body.ref !== undefined && typeof body.ref !== 'string') {
      return NextResponse.json(
        { error: 'Ref must be a string' },
        { status: 400 }
      )
    }

    const result = await scanRepo(body.url, body.ref || 'main')

    if (result.error) {
      // Guard against service returning an invalid or missing HTTP status code
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
    // SyntaxError is thrown by request.json() when the body is not valid JSON
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
