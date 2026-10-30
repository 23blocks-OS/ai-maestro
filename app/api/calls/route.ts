/**
 * GET  /api/calls  — calls on this host, newest first (?caller= ?callee= ?active=1 filter)
 * POST /api/calls  — { caller, callee, ttlSeconds? } start a call (state: inviting)
 */

import { NextRequest } from 'next/server'
import { getCalls, startCall } from '@/services/calls-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  return toResponse(getCalls({ caller: q.get('caller'), callee: q.get('callee'), active: q.get('active') === '1' }))
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return toResponse(startCall(body))
}
