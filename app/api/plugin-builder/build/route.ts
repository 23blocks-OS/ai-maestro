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
  let body: unknown
  try {
    // Parse JSON separately so parse failures are always reported as 400
    body = await request.json()
  } catch (error) {
    // SyntaxError is thrown by request.json() when the body is not valid JSON
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    // Any other unexpected error during body parsing is a server-side failure
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }

  try {
    // Errors thrown by buildPlugin are unexpected server errors, not client errors
    const result = await buildPlugin(body)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('Error during plugin build:', error)
    return NextResponse.json(
      { error: 'Internal server error during plugin build' },
      { status: 500 }
    )
  }
}
