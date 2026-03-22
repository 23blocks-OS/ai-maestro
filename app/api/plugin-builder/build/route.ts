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
  // Isolate JSON parse failures (SyntaxError) from service errors.
  // Only malformed request bodies should yield 400; unexpected service
  // failures must propagate as 500 so clients are not misled.
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  try {
    // body is unknown from request.json() — service layer validates the shape
    const result = await buildPlugin(body as PluginBuildConfig)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        // Fallback to 500 if the service omitted status, so clients are never
        // misled by a 200 response that carries an error body.
        { status: result.status ?? 500 }
      )
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('Unexpected error in POST /api/plugin-builder/build:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
