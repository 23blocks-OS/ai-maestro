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
  // Only catch JSON parse errors here — service errors must not be masked as 400
  let body: PluginPushConfig
  try {
    body = await request.json() as PluginPushConfig
  } catch (error) {
    console.error('Error parsing request body:', error)
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
      // Fallback to 500 if the service omits a status code, so errors never
      // incorrectly return 200
      { status: result.status ?? 500 }
    )
  }
  return NextResponse.json(result.data)
}
