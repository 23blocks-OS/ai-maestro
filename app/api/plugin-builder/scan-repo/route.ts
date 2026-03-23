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

    // Validate optional ref field when provided
    if (body.ref !== undefined && typeof body.ref !== 'string') {
      return NextResponse.json(
        { error: 'Repository reference must be a string' },
        { status: 400 }
      )
    }

    const result = await scanRepo(body.url, body.ref || 'main')

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // SyntaxError means the request body was not valid JSON
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }
    console.error('Error scanning repo:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred while scanning the repository' },
      { status: 500 }
    )
  }
}
