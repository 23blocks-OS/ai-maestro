/**
 * Plugin Builder - Build API
 *
 * POST /api/plugin-builder/build - Start a plugin build
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildPlugin } from '@/services/plugin-builder-service'
import type { PluginBuildConfig } from '@/types/plugin-builder'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as PluginBuildConfig

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { error: 'Plugin name is required' },
        { status: 400 }
      )
    }

    if (!body.version || typeof body.version !== 'string') {
      return NextResponse.json(
        { error: 'Plugin version is required' },
        { status: 400 }
      )
    }

    if (!body.skills || !Array.isArray(body.skills) || body.skills.length === 0) {
      return NextResponse.json(
        { error: 'At least one skill must be selected' },
        { status: 400 }
      )
    }

    // Validate plugin name format
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(body.name)) {
      return NextResponse.json(
        { error: 'Plugin name must start with a letter/number and contain only letters, numbers, hyphens, and underscores' },
        { status: 400 }
      )
    }

    const result = await buildPlugin(body)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('Error in plugin build:', error)
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }
}
