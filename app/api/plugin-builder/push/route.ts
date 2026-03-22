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

    if (
      !body.manifest ||
      typeof body.manifest !== 'object' ||
      Array.isArray(body.manifest) ||
      typeof body.manifest.name !== 'string' ||
      !body.manifest.name ||
      typeof body.manifest.version !== 'string' ||
      !body.manifest.version ||
      typeof body.manifest.output !== 'string' ||
      !body.manifest.output ||
      !Array.isArray(body.manifest.sources) ||
      body.manifest.sources.length === 0
    ) {
      return NextResponse.json(
        { error: 'Manifest is required and must include name, version, output, and sources' },
        { status: 400 }
      )
    }

    // Validate each source entry matches the PluginManifestSource tagged union:
    // every source must have a non-empty name string, a type of 'local' or 'git',
    // a map object, and the type-specific required fields (path for local; repo+ref for git).
    const invalidSource = body.manifest.sources.find((src: unknown) => {
      if (!src || typeof src !== 'object' || Array.isArray(src)) return true
      const s = src as Record<string, unknown>
      if (typeof s.name !== 'string' || !s.name) return true
      if (s.type !== 'local' && s.type !== 'git') return true
      if (!s.map || typeof s.map !== 'object' || Array.isArray(s.map)) return true
      if (s.type === 'local' && (typeof s.path !== 'string' || !s.path)) return true
      if (s.type === 'git' && (typeof s.repo !== 'string' || !s.repo)) return true
      if (s.type === 'git' && (typeof s.ref !== 'string' || !s.ref)) return true
      return false
    })
    if (invalidSource !== undefined) {
      return NextResponse.json(
        { error: 'Each source must have name, type ("local" or "git"), map, and type-specific fields (path for local; repo and ref for git)' },
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
    // Distinguish JSON parse failures (client error) from all other failures (server error)
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred during the GitHub push operation' },
      { status: 500 }
    )
  }
}
