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
  try {
    const body = await request.json()
    const result = await buildPlugin(body)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    // Log full error for internal debugging regardless of error type
    console.error('Error in POST /api/plugin-builder/build:', error)

    // Return 400 only when the error is clearly a JSON parsing failure
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid request body: Malformed JSON' },
        { status: 400 }
      )
    }

    // All other unexpected errors are server-side; do not mislead the client
    return NextResponse.json(
      { error: 'An unexpected server error occurred' },
      { status: 500 }
    )
  }
}
