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
    const body = await request.json()

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
    if (!body.manifest.name || typeof body.manifest.name !== 'string') {
      return NextResponse.json({ error: 'Manifest name is required' }, { status: 400 })
    }
    if (!body.manifest.version || typeof body.manifest.version !== 'string') {
      return NextResponse.json({ error: 'Manifest version is required' }, { status: 400 })
    }
    if (!body.manifest.output || typeof body.manifest.output !== 'string') {
      return NextResponse.json({ error: 'Manifest output is required' }, { status: 400 })
    }
    if (!body.manifest.plugin || typeof body.manifest.plugin !== 'object') {
      return NextResponse.json({ error: 'Manifest plugin metadata is required' }, { status: 400 })
    }
    if (!Array.isArray(body.manifest.sources)) {
      return NextResponse.json({ error: 'Manifest sources must be an array' }, { status: 400 })
    }
    if (body.branch !== undefined && typeof body.branch !== 'string') {
      return NextResponse.json({ error: 'Branch must be a string if provided' }, { status: 400 })
    }

    const config: PluginPushConfig = body

    const result = await pushToGitHub(config)

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
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }
}
