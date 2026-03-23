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
  // Parse the request body separately so JSON parse errors return 400,
  // while errors from the service call correctly return 500.
  let body: PluginPushConfig
  try {
    body = await request.json() as PluginPushConfig
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  try {
    if (!body.forkUrl || typeof body.forkUrl !== 'string') {
      return NextResponse.json(
        { error: 'Fork URL is required' },
        { status: 400 }
      )
    }

    // Explicit null/array guard: typeof null === 'object' and typeof [] === 'object',
    // so we must check both to ensure manifest is a non-null, non-array plain object.
    if (!body.manifest || typeof body.manifest !== 'object' || Array.isArray(body.manifest)) {
      return NextResponse.json(
        { error: 'Manifest is required' },
        { status: 400 }
      )
    }

    // Validate required PluginManifest fields so that an incomplete manifest is
    // rejected here with a clear 400 rather than being silently written to the
    // fork or causing an opaque 500 deep inside the service.
    const manifest = body.manifest
    if (!manifest.name || typeof manifest.name !== 'string') {
      return NextResponse.json(
        { error: 'Manifest must include a valid "name" field' },
        { status: 400 }
      )
    }
    if (!manifest.version || typeof manifest.version !== 'string') {
      return NextResponse.json(
        { error: 'Manifest must include a valid "version" field' },
        { status: 400 }
      )
    }
    if (!manifest.output || typeof manifest.output !== 'string') {
      return NextResponse.json(
        { error: 'Manifest must include a valid "output" field' },
        { status: 400 }
      )
    }
    if (!manifest.plugin || typeof manifest.plugin !== 'object' || Array.isArray(manifest.plugin)) {
      return NextResponse.json(
        { error: 'Manifest must include a valid "plugin" metadata object' },
        { status: 400 }
      )
    }
    // Validate required fields within the plugin metadata object so that an
    // empty {} or partially-filled object is rejected here rather than being
    // silently serialised to disk as an incomplete manifest.
    if (!manifest.plugin.name || typeof manifest.plugin.name !== 'string') {
      return NextResponse.json(
        { error: 'Manifest "plugin" metadata must include a valid "name" field' },
        { status: 400 }
      )
    }
    if (!manifest.plugin.version || typeof manifest.plugin.version !== 'string') {
      return NextResponse.json(
        { error: 'Manifest "plugin" metadata must include a valid "version" field' },
        { status: 400 }
      )
    }
    if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
      return NextResponse.json(
        { error: 'Manifest must include a non-empty "sources" array' },
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
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
