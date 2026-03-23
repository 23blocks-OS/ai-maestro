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
    // Parse body first without type assertion — validate shape at runtime before trusting the type
    const body: unknown = await request.json()

    // Validate that body is a non-null object before accessing any properties
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Request body must be a JSON object' },
        { status: 400 }
      )
    }

    const { forkUrl, manifest } = body as Record<string, unknown>

    if (!forkUrl || typeof forkUrl !== 'string') {
      return NextResponse.json(
        { error: 'Fork URL is required' },
        { status: 400 }
      )
    }

    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return NextResponse.json(
        { error: 'Manifest is required' },
        { status: 400 }
      )
    }

    // Validate required PluginManifest fields so that pushToGitHub never receives
    // a structurally incomplete manifest (an empty {} would otherwise pass the
    // typeof check above and then cause runtime failures deep inside the service).
    const m = manifest as Record<string, unknown>
    if (!m.name || typeof m.name !== 'string') {
      return NextResponse.json(
        { error: 'Manifest must contain a valid "name" string' },
        { status: 400 }
      )
    }
    if (!m.version || typeof m.version !== 'string') {
      return NextResponse.json(
        { error: 'Manifest must contain a valid "version" string' },
        { status: 400 }
      )
    }
    if (!m.output || typeof m.output !== 'string') {
      return NextResponse.json(
        { error: 'Manifest must contain a valid "output" string' },
        { status: 400 }
      )
    }
    if (!m.plugin || typeof m.plugin !== 'object' || Array.isArray(m.plugin)) {
      return NextResponse.json(
        { error: 'Manifest must contain a valid "plugin" object' },
        { status: 400 }
      )
    }
    if (!Array.isArray(m.sources)) {
      return NextResponse.json(
        { error: 'Manifest must contain a "sources" array' },
        { status: 400 }
      )
    }

    // Shape is fully validated — safe to cast to the typed interface
    const validatedBody = { forkUrl, manifest } as unknown as PluginPushConfig

    const result = await pushToGitHub(validatedBody)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error pushing to GitHub:', error)
    // JSON.parse failures (SyntaxError) are a 400 — any other unexpected error is a 500
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
