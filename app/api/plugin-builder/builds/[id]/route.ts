/**
 * Plugin Builder - Build Status API
 *
 * GET /api/plugin-builder/builds/:id - Check build status
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getBuildStatus } from '@/services/plugin-builder-service'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  // Wrap in try-catch so unexpected service errors are logged and returned as 500,
  // rather than propagating unhandled and relying on Next.js defaults.
  try {
    const result = await getBuildStatus(id)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        // Use ?? 500 so that a missing status never causes a 200 response for an error body.
        { status: result.status ?? 500 }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error(`Unexpected error in GET /api/plugin-builder/builds/${id}:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
