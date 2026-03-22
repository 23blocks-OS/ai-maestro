/**
 * Plugin Builder - Build API
 *
 * POST /api/plugin-builder/build - Start a plugin build
 *
 * Thin wrapper: all validation lives in the service layer.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildPlugin } from '@/services/plugin-builder-service'
import type { PluginBuildConfig } from '@/types/plugin-builder'

export async function POST(request: NextRequest) {
  // Separate JSON parse errors (400) from unexpected service errors (500)
  let body: PluginBuildConfig
  try {
    body = await request.json() as PluginBuildConfig
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  try {
    const result = await buildPlugin(body)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('Error starting build:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
