/**
 * Plugin Builder - Repo Scanner API
 *
 * POST /api/plugin-builder/scan-repo - Scan a git repo for skills
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { scanRepo } from '@/services/plugin-builder-service'

interface ScanRepoRequestBody {
  url: string
  ref?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: ScanRepoRequestBody = await request.json()

    if (!body.url || typeof body.url !== 'string') {
      return NextResponse.json(
        { error: 'Repository URL is required' },
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
    console.error('Error scanning repo:', error)
    // SyntaxError is thrown by request.json() when the body is not valid JSON
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error during repository scan' },
      { status: 500 }
    )
  }
}
