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
    // Guard against a service result that has neither error nor data, which
    // would cause NextResponse.json(undefined) — an invalid response.
    if (!result.data) {
      return NextResponse.json(
        { error: 'Push operation returned no data' },
        { status: 500 }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error pushing to GitHub:', error)
    // SyntaxError is thrown by request.json() on malformed JSON — 400.
    // Any other unexpected error is a server fault — 500.
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Malformed JSON in request body' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
