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
  try {
    // Parse JSON first — SyntaxError here means malformed request body
    body = await request.json()
  } catch (error) {
    console.error('Error parsing request body:', error)
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    )
  }

  // Validate that the parsed value is a non-null object before asserting the type
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      { error: 'Invalid request body format' },
      { status: 400 }
    )
  }

  const config = body as PluginPushConfig

  if (!config.forkUrl || typeof config.forkUrl !== 'string') {
    return NextResponse.json(
      { error: 'Fork URL is required' },
      { status: 400 }
    )
  }

  // Explicit null check: typeof null === 'object', so guard against it
  if (config.manifest === null || config.manifest === undefined || typeof config.manifest !== 'object') {
    return NextResponse.json(
      { error: 'Manifest is required' },
      { status: 400 }
    )
  }

  // Validate required PluginManifest fields so pushToGitHub always receives a complete manifest
  const manifest = config.manifest as Record<string, unknown>
  if (typeof manifest.name !== 'string' || !manifest.name) {
    return NextResponse.json(
      { error: 'Manifest must contain a valid name' },
      { status: 400 }
    )
  }
  if (typeof manifest.version !== 'string' || !manifest.version) {
    return NextResponse.json(
      { error: 'Manifest must contain a valid version' },
      { status: 400 }
    )
  }
  if (typeof manifest.output !== 'string' || !manifest.output) {
    return NextResponse.json(
      { error: 'Manifest must contain a valid output path' },
      { status: 400 }
    )
  }
  if (manifest.plugin === null || manifest.plugin === undefined || typeof manifest.plugin !== 'object') {
    return NextResponse.json(
      { error: 'Manifest must contain a valid plugin metadata object' },
      { status: 400 }
    )
  }
  if (!Array.isArray(manifest.sources)) {
    return NextResponse.json(
      { error: 'Manifest must contain a sources array' },
      { status: 400 }
    )
  }

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
    // Errors here come from pushToGitHub, not from request parsing — use 500
    console.error('Error pushing to GitHub:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred while pushing to GitHub' },
      { status: 500 }
    )
  }
}
