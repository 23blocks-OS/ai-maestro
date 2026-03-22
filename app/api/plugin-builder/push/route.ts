/**
 * Plugin Builder - Push to GitHub API
 *
 * POST /api/plugin-builder/push - Push manifest to user's fork
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { pushToGitHub } from '@/services/plugin-builder-service'
import type { PluginPushConfig } from '@/types/plugin-builder'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as PluginPushConfig

    if (!body.forkUrl || typeof body.forkUrl !== 'string') {
      return NextResponse.json(
        { error: 'Fork URL is required' },
        { status: 400 }
      )
    }

    if (!body.manifest || typeof body.manifest !== 'object') {
      return NextResponse.json(
        { error: 'Manifest is required' },
        { status: 400 }
      )
    }

    if (!body.manifest.name || typeof body.manifest.name !== 'string' || body.manifest.name.trim() === '') {
      return NextResponse.json(
        { error: 'Manifest name is required' },
        { status: 400 }
      )
    }

    const result = await pushToGitHub(body)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        // Fallback to 500 when the service omits a status code so the
        // response never accidentally becomes HTTP 200 for an error path.
        { status: result.status ?? 500 }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error pushing to GitHub:', error)
    // SyntaxError is thrown by request.json() when the body is not valid JSON —
    // that is a client mistake, so 400 is correct.  Any other thrown error is an
    // unexpected server fault and must be reported as 500, not misclassified as
    // a bad client request.
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
