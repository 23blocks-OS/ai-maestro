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
  // Separate try/catch for JSON parsing so that malformed request bodies
  // return 400, while errors from pushToGitHub return 500.
  let body: PluginPushConfig
  try {
    body = await request.json() as PluginPushConfig
  } catch (error) {
    console.error('Error parsing request body:', error)
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

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

  try {
    const result = await pushToGitHub(body)

    if (result.error) {
      // Guard: only use result.status if it is a valid HTTP error code (400-599),
      // otherwise default to 500 to avoid returning a non-error status with an error body.
      const statusCode =
        typeof result.status === 'number' &&
        result.status >= 400 &&
        result.status < 600
          ? result.status
          : 500
      return NextResponse.json(
        { error: result.error },
        { status: statusCode }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error pushing to GitHub:', error)
    return NextResponse.json(
      { error: 'Failed to push to GitHub' },
      { status: 500 }
    )
  }
}
