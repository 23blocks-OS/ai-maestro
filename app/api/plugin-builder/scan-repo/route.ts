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

    // Validate ref type — non-string and empty-string values must not reach scanRepo
    const ref = (typeof body.ref === 'string' && body.ref) ? body.ref : 'main'
    const result = await scanRepo(body.url, ref)

    if (result.error) {
      // Provide a 500 fallback in case the service omits status on error
      return NextResponse.json(
        { error: result.error },
        { status: result.status || 500 }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error scanning repo:', error)
    // SyntaxError from request.json() means the client sent malformed JSON — 400 Bad Request
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
