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

    // Validate body.ref type: if provided, it must be a string
    if (body.ref !== undefined && typeof body.ref !== 'string') {
      return NextResponse.json(
        { error: 'Repository reference (ref) must be a string if provided' },
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
    // Unexpected server-side failure — not a bad request, so use 500
    console.error('Error scanning repo:', error)
    return NextResponse.json(
      { error: 'Internal server error during repository scan' },
      { status: 500 }
    )
  }
}
