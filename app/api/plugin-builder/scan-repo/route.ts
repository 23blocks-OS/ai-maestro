/**
 * Plugin Builder - Repo Scanner API
 *
 * POST /api/plugin-builder/scan-repo - Scan a git repo for skills
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { scanRepo } from '@/services/plugin-builder-service'

export async function POST(request: NextRequest) {
  // Parse the JSON body separately so SyntaxError is distinguished from scanRepo errors
  let body: { url?: unknown; ref?: unknown }
  try {
    body = await request.json()
  } catch (error) {
    console.error('Failed to parse request body:', error)
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  if (!body.url || typeof body.url !== 'string') {
    return NextResponse.json(
      { error: 'Repository URL is required' },
      { status: 400 }
    )
  }

  try {
    const result = await scanRepo(body.url, typeof body.ref === 'string' ? body.ref : 'main')

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
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
