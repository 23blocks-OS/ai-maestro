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

export async function POST(request: NextRequest) {
  // Isolate JSON parse errors (client error) from service errors (server error)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  // Basic structural check — service performs deep validation
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  // Assert body as a record for better type inference; buildPlugin still accepts unknown
  const requestBody = body as Record<string, unknown>

  try {
    // Pass body as unknown — buildPlugin accepts unknown and validates all fields internally
    const result = await buildPlugin(requestBody)

    // Guard against a malformed or missing result from the service
    if (!result || typeof result !== 'object') {
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (result.error) {
      // Service always sets explicit status for client errors (400, 429, etc.).
      // If status is absent, the error is an unclassified server failure — use 500.
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      )
    }

    // Guard against a missing data payload on the success path
    if (result.data === undefined || result.data === null) {
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }

    return NextResponse.json(result.data, { status: result.status ?? 200 })
  } catch (error) {
    // Service-level or unexpected errors are server failures, not client errors
    console.error('[plugin-builder/build] buildPlugin error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
