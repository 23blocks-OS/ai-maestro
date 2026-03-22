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
    // Log every unexpected error for server-side debugging
    console.error('Error in POST /api/plugin-builder/build:', error)
    // SyntaxError means request.json() could not parse the body.
    // NOTE: buildPlugin always returns a ServiceResult and never throws; this
    // catch block only handles request.json() parse failures and any truly
    // unexpected runtime error in the route itself.
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    // Any other unexpected error is a route-level server fault (not from buildPlugin)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
