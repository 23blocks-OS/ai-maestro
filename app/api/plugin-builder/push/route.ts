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
  } catch (error) {
    // Errors here come from pushToGitHub, not from request parsing — use 500
    console.error('Error pushing to GitHub:', error)
    // Differentiate JSON parsing failures from other unexpected errors
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

  // Validate manifest has required sub-fields (output, plugin, sources)
  // NOTE: PluginManifest has no top-level name/version — those live inside manifest.plugin
  const manifest = body.manifest as Record<string, unknown>
  if (!manifest.output || typeof manifest.output !== 'string') {
    return NextResponse.json({ error: 'Manifest output is required' }, { status: 400 })
  }
  if (!manifest.plugin || typeof manifest.plugin !== 'object') {
    return NextResponse.json({ error: 'Manifest plugin metadata is required' }, { status: 400 })
  }
  // Validate required sub-fields of manifest.plugin (PluginManifestMetadata)
  const pluginMetadata = manifest.plugin as Record<string, unknown>
  if (!pluginMetadata.name || typeof pluginMetadata.name !== 'string') {
    return NextResponse.json({ error: 'Manifest plugin name is required' }, { status: 400 })
  }
  if (!pluginMetadata.version || typeof pluginMetadata.version !== 'string') {
    return NextResponse.json({ error: 'Manifest plugin version is required' }, { status: 400 })
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

  // Construct config explicitly from validated fields instead of unsafe cast
  const config: PluginPushConfig = {
    forkUrl: body.forkUrl as string,
    manifest: body.manifest as PluginPushConfig['manifest'],
    ...(body.branch !== undefined && { branch: body.branch as string }),
  }

  const result = await pushToGitHub(config)

  if (result.error) {
    // Guard: ensure result.status is a valid HTTP status code before forwarding it
    const statusCode =
      typeof result.status === 'number' && result.status >= 100 && result.status < 600
        ? result.status
        : 500
    return NextResponse.json(
      { error: result.error },
      { status: statusCode }
    )
  }
  return NextResponse.json(result.data)
}
