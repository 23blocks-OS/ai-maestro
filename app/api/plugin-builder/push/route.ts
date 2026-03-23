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
  let body: PluginPushConfig
  try {
    // Parse JSON separately so parse failures are always reported as 400,
    // before any business-logic validation or service calls run.
    body = await request.json() as PluginPushConfig
  } catch (error) {
    // SyntaxError is thrown by request.json() when the body is not valid JSON
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    // Any other unexpected error during body parsing is a server-side failure
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }

  if (!body.forkUrl || typeof body.forkUrl !== 'string') {
    return NextResponse.json(
      { error: 'Fork URL is required' },
      { status: 400 }
    )
  }

  if (!body.manifest || typeof body.manifest !== 'object' || Array.isArray(body.manifest)) {
    return NextResponse.json(
      { error: 'Manifest is required and must be a valid object' },
      { status: 400 }
    )
  }

  try {
    // Errors thrown by pushToGitHub are unexpected server errors, not client errors
    const result = await pushToGitHub(body)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }

    // result.data is optional in ServiceResult; guard so we never serialise
    // undefined as an empty response body
    if (!result.data) {
      return NextResponse.json(
        { error: 'Internal server error: push completed without result data' },
        { status: 500 }
      )
    }

    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('Error pushing to GitHub:', error)
    return NextResponse.json(
      { error: 'Internal server error during push to GitHub' },
      { status: 500 }
    )
  }
}
