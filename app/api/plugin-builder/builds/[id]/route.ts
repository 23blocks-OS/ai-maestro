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

  const result = await getBuildStatus(id)

  if (result.error) {
    // Validate result.status is a proper HTTP status code; fall back to 500 if not
    const statusCode = result.status && typeof result.status === 'number' && result.status >= 100 && result.status < 600
      ? result.status
      : 500
    return NextResponse.json(
      { error: result.error },
      { status: statusCode }
    )
  }
  return NextResponse.json(result.data)
}
