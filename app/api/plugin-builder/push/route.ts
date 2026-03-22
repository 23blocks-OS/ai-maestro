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

    const result = await pushToGitHub(body)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error pushing to GitHub:', error)
    // JSON parsing errors from request.json() are SyntaxErrors — report them as 400
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    // All other errors (e.g. exceptions thrown inside pushToGitHub) are internal failures
    return NextResponse.json(
      { error: 'Failed to push to GitHub due to an internal server error.' },
      { status: 500 }
    )
  }
}
