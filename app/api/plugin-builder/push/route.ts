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
  // SF-004: Separate JSON parsing from service call so service errors
  // are not misattributed as "Invalid request body" (400)
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  // SF-001: Explicit field validation for all required PluginPushConfig fields
  // instead of relying on unsafe `as` cast
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

  // Validate manifest has required sub-fields (name, version, output, plugin, sources)
  const manifest = body.manifest as Record<string, unknown>
  if (!manifest.name || typeof manifest.name !== 'string') {
    return NextResponse.json({ error: 'Manifest name is required' }, { status: 400 })
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    return NextResponse.json({ error: 'Manifest version is required' }, { status: 400 })
  }
  if (!manifest.output || typeof manifest.output !== 'string') {
    return NextResponse.json({ error: 'Manifest output is required' }, { status: 400 })
  }
  if (!manifest.plugin || typeof manifest.plugin !== 'object') {
    return NextResponse.json({ error: 'Manifest plugin metadata is required' }, { status: 400 })
  }
  if (!Array.isArray(manifest.sources)) {
    return NextResponse.json({ error: 'Manifest sources must be an array' }, { status: 400 })
  }
  // SF-014: Validate each source element is a string to prevent unsafe `as` cast downstream
  if (!manifest.sources.every((s: unknown) => typeof s === 'string')) {
    return NextResponse.json({ error: 'Each manifest source must be a string' }, { status: 400 })
  }
  if (body.branch !== undefined && typeof body.branch !== 'string') {
    return NextResponse.json({ error: 'Branch must be a string if provided' }, { status: 400 })
  }

  const config: PluginPushConfig = body as PluginPushConfig

  const result = await pushToGitHub(config)

  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data)
}
