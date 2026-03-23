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
  let body: unknown

  // Parse JSON separately so SyntaxError is distinguishable from pushToGitHub errors
  try {
    body = await request.json()
  } catch (error) {
    // request.json() throws SyntaxError when the body is not valid JSON
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }
    // Any other parse-layer error is still a client-side problem
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  // Runtime validation — type assertion happens only after guards confirm shape
  const rawBody = body as Record<string, unknown>

  if (!rawBody.forkUrl || typeof rawBody.forkUrl !== 'string') {
    return NextResponse.json(
      { error: 'Fork URL is required' },
      { status: 400 }
    )
  }

  if (!rawBody.manifest || typeof rawBody.manifest !== 'object' || Array.isArray(rawBody.manifest)) {
    return NextResponse.json(
      { error: 'Manifest is required and must be a valid object' },
      { status: 400 }
    )
  }

  // Shape is confirmed; safe to treat as PluginPushConfig
  const config = rawBody as unknown as PluginPushConfig

  try {
    const result = await pushToGitHub(config)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // pushToGitHub errors are server-side failures, not client request problems
    console.error('Error pushing to GitHub:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred during the push operation' },
      { status: 500 }
    )
  }
}
