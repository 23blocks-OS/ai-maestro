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
  // Parse the request body separately so JSON parse errors always return 400,
  // while buildPlugin errors use their own specific status codes (400, 429, 500, etc.)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  // Guard: buildPlugin expects a non-null object; reject any other JSON value early
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: 'Request body must be an object' },
      { status: 400 }
    )
  }

  // buildPlugin always returns a ServiceResult and never throws
  const result = await buildPlugin(body as Parameters<typeof buildPlugin>[0])

  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data, { status: result.status })
}
