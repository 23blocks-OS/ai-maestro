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
    return NextResponse.json(
      { error: result.error },
      // Default to 500 if the service omits the status field on an error result
      { status: typeof result.status === 'number' ? result.status : 500 }
    )
  }
  return NextResponse.json(result.data)
}
