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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const result = await getBuildStatus(id)

  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data)
}
