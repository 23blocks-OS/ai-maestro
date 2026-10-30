/**
 * GET /api/calls/:id  — one call and its current state
 */

import { NextRequest } from 'next/server'
import { getCallById } from '@/services/calls-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(getCallById(id))
}
