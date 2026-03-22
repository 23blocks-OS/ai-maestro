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
  // Scope the JSON parse error narrowly: only request.json() failures are 400.
  // buildPlugin errors propagate naturally so Next.js returns 500 for server faults.
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  // Wrap buildPlugin in its own try-catch so unexpected exceptions return a
  // structured 500 response instead of propagating to Next.js unhandled.
  let result: Awaited<ReturnType<typeof buildPlugin>>
  try {
    result = await buildPlugin(body)
  } catch (err) {
    console.error('Unexpected error in buildPlugin:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }

  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data, { status: result.status })
}
