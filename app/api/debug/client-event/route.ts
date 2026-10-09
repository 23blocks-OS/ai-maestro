import { NextRequest } from 'next/server'
import { logClientEvent } from '@/services/debug-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/debug/client-event
 * The dashboard reports each page load (and why the previous page ended, if it
 * knows) so an unexplained "the app reset" can be diagnosed from the server log:
 * the server alone cannot tell a reload from a crash from a navigation.
 * Logic in services/debug-service.ts (shared with the headless router).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return toResponse(logClientEvent(body, request.headers.get('user-agent')))
}
