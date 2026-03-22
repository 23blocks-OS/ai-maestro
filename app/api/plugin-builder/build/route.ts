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
  // SF-004: Separate JSON parsing from service call so service errors
  // are not misattributed as "Invalid request body" (400)
  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    // JSON parse failures from request.json() are a client error (malformed body)
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }
    // All other unexpected errors are server-side failures
    console.error('Unexpected error in POST /api/plugin-builder/build:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }

  const result = await buildPlugin(body as Parameters<typeof buildPlugin>[0])

  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data, { status: result.status })
}
