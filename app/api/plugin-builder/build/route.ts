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
    // JSON parse failures from request.json() are the caller's fault (400)
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    // Any other error (service failure, internal error) is a server-side problem (500)
    console.error('Unexpected error in POST /api/plugin-builder/build:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
