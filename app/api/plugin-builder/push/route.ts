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
  // Isolate JSON parse failures so they return 400, not 500
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

    if (!body.manifest || typeof body.manifest !== 'object') {
      return NextResponse.json(
        { error: 'Manifest is required' },
        { status: 400 }
      )
    }

    const result = await pushToGitHub(body)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        // Fall back to 500 when pushToGitHub sets error but omits status
        { status: result.status ?? 500 }
      )
    }

    // Guard against pushToGitHub returning a result with neither error nor data
    if (result.data === undefined) {
      console.error('pushToGitHub returned no data and no error:', result)
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
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
