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
    body = await request.json()
  } catch (error) {
    // SyntaxError is thrown by request.json() when the body is not valid JSON
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }
    console.error('Error reading request body:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }

  const result = await buildPlugin(body)

  if (result.error) {
    // Guard against service returning an invalid or missing HTTP status code
    const statusCode =
      typeof result.status === 'number' && result.status >= 100 && result.status < 600
        ? result.status
        : 500
    return NextResponse.json(
      { error: result.error },
      { status: statusCode }
    )
  }
  // Guard against service returning an invalid or missing HTTP status code
  const statusCode =
    typeof result.status === 'number' && result.status >= 100 && result.status < 600
      ? result.status
      : 200
  return NextResponse.json(result.data, { status: statusCode })
}
