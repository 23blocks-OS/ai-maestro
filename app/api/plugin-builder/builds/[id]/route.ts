/**
 * Plugin Builder - Build Status API
 *
 * GET /api/plugin-builder/builds/:id - Check build status
 */

import type { NextRequest } from 'next/server'
import { getBuildStatus } from '@/services/plugin-builder-service'
import { toResponse } from '@/app/api/_helpers'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await getBuildStatus(id)
  return toResponse(result)
}
