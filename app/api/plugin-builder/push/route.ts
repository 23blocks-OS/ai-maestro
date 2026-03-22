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

    // Array.isArray guard: typeof [] === 'object', which would pass a bare object check
    if (!body.manifest || typeof body.manifest !== 'object' || Array.isArray(body.manifest)) {
      return NextResponse.json(
        { error: 'Manifest is required and must be an object' },
        { status: 400 }
      )
    }

    const result = await pushToGitHub(body)

    if (result.error) {
      // Guard: ensure result.status is a valid HTTP status code range before using it
      const statusCode = typeof result.status === 'number' && result.status >= 100 && result.status < 600
        ? result.status
        : 500
      return NextResponse.json(
        { error: result.error },
        { status: statusCode }
      )
    }
    // Guard: ensure result.status is a valid 2xx HTTP status code before using it for success
    const successStatusCode = typeof result.status === 'number' && result.status >= 200 && result.status < 300
      ? result.status
      : 200
    return NextResponse.json(result.data, { status: successStatusCode })
  } catch (error) {
    console.error('Error pushing to GitHub:', error)
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error during push to GitHub' },
      { status: 500 }
    )
  }
}
