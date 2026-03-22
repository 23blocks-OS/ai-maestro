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
  // Parse JSON body in its own try/catch so JSON parse errors are not
  // confused with errors that originate inside pushToGitHub.
  let body: PluginPushConfig
  try {
    body = await request.json() as PluginPushConfig
  } catch (parseError) {
    console.error('Error parsing request body:', parseError)
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

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
    !body.manifest.plugin ||
    typeof body.manifest.plugin !== 'object' ||
    typeof body.manifest.plugin.name !== 'string' ||
    !body.manifest.plugin.name ||
    !Array.isArray(body.manifest.sources)
  ) {
    return NextResponse.json(
      { error: 'Manifest is required and must be a valid object with name, version, output, plugin, and sources' },
      { status: 400 }
    )
  }

  // Separate try/catch for the service call so any unexpected throws from
  // pushToGitHub are surfaced as a 500 rather than a misleading 400.
  try {
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
      { error: 'Internal server error during GitHub push' },
      { status: 500 }
    )
  }
}
