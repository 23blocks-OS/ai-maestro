/**
 * GET  /api/people  — people stored on this host (?includeInactive=1 adds deactivated ones)
 * POST /api/people  — add one { displayName, givenName?, familyName?, email?, phone? (E.164), title?, role? }
 */

import { NextRequest } from 'next/server'
import { listPeople, createPerson } from '@/services/people-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return toResponse(listPeople({ includeInactive: request.nextUrl.searchParams.get('includeInactive') === '1' }))
}

export async function POST(request: NextRequest) {
  // A JSON null or number is not a body: treat it as empty rather than failing with a 500
  const parsed = await request.json().catch(() => ({}))
  const body = parsed && typeof parsed === 'object' ? parsed : {}
  return toResponse(createPerson(body))
}
