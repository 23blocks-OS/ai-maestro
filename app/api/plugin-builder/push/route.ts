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

    // Validate manifest has the required PluginManifest fields before passing to service.
    // Each condition is checked separately so the error message precisely identifies
    // which field or entry failed validation, making it actionable for the caller.
    const manifest = body.manifest

    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return NextResponse.json(
        { error: 'Manifest is required and must be a non-null object' },
        { status: 400 }
      )
    }

    if (typeof manifest.name !== 'string' || !manifest.name) {
      return NextResponse.json(
        { error: 'Manifest must include a non-empty string field: name' },
        { status: 400 }
      )
    }

    if (typeof manifest.version !== 'string' || !manifest.version) {
      return NextResponse.json(
        { error: 'Manifest must include a non-empty string field: version' },
        { status: 400 }
      )
    }

    if (typeof manifest.output !== 'string' || !manifest.output) {
      return NextResponse.json(
        { error: 'Manifest must include a non-empty string field: output' },
        { status: 400 }
      )
    }

    if (!manifest.plugin || typeof manifest.plugin !== 'object' || Array.isArray(manifest.plugin)) {
      return NextResponse.json(
        { error: 'Manifest must include a plugin field that is a non-null object' },
        { status: 400 }
      )
    }

    const pluginObj = manifest.plugin as Record<string, unknown>

    if (typeof pluginObj.name !== 'string' || !pluginObj.name) {
      return NextResponse.json(
        { error: 'Manifest plugin object must include a non-empty string field: name' },
        { status: 400 }
      )
    }

    if (typeof pluginObj.version !== 'string' || !pluginObj.version) {
      return NextResponse.json(
        { error: 'Manifest plugin object must include a non-empty string field: version' },
        { status: 400 }
      )
    }

    if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
      return NextResponse.json(
        { error: 'Manifest must include a non-empty sources array' },
        { status: 400 }
      )
    }

    for (let i = 0; i < manifest.sources.length; i++) {
      const s: unknown = manifest.sources[i]
      if (s === null || typeof s !== 'object' || Array.isArray(s)) {
        return NextResponse.json(
          { error: `sources[${i}] must be a non-null object` },
          { status: 400 }
        )
      }
      const src = s as Record<string, unknown>
      if (typeof src.name !== 'string' || !src.name) {
        return NextResponse.json(
          { error: `sources[${i}] must include a non-empty string field: name` },
          { status: 400 }
        )
      }
      if (src.type !== 'local' && src.type !== 'git') {
        return NextResponse.json(
          { error: `sources[${i}].type must be 'local' or 'git'` },
          { status: 400 }
        )
      }
      if (src.map === null || typeof src.map !== 'object' || Array.isArray(src.map)) {
        return NextResponse.json(
          { error: `sources[${i}].map must be a non-null, non-array object` },
          { status: 400 }
        )
      }
      const mapObj = src.map as Record<string, unknown>
      if (Object.keys(mapObj).length === 0) {
        return NextResponse.json(
          { error: `sources[${i}].map must be a non-empty object` },
          { status: 400 }
        )
      }
      if (!Object.values(mapObj).every((value) => typeof value === 'string')) {
        return NextResponse.json(
          { error: `sources[${i}].map must have only string values` },
          { status: 400 }
        )
      }
    }

    const result = await pushToGitHub(body)

    if (result.error) {
      // Only use result.status when it is a valid HTTP error status code (4xx or 5xx).
      // Any other value (including 2xx codes that may coincide with an error field) must
      // fall back to 500 so the client always receives an unambiguous error response.
      const httpStatus =
        typeof result.status === 'number' && result.status >= 400 && result.status <= 599
          ? result.status
          : 500
      return NextResponse.json(
        { error: result.error },
        { status: httpStatus }
      )
    }
    // Guard against a ServiceResult that has neither error nor data — this would
    // mean a bug in the service layer; surface it as a server error rather than
    // silently returning an empty 200 body.
    if (result.data === undefined) {
      console.error('pushToGitHub returned a successful result with no data')
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error in POST /api/plugin-builder/push:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
