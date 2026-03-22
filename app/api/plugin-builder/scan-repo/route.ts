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

    // Validate ref: must be a string when provided, default to 'main' otherwise
    const ref = typeof body.ref === 'string' ? body.ref : 'main'
    const result = await scanRepo(body.url, ref)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        // result.status may be undefined if the service omits it on error paths
        { status: result.status || 500 }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error scanning repo:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
