import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/debug/client-event
 * The dashboard reports each page load (and why the previous page ended, if it
 * knows) so an unexplained "the app reset" can be diagnosed from the server log:
 * the server alone cannot tell a reload from a crash from a navigation.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const clip = (v: unknown, n = 300) => String(v ?? '').slice(0, n)
  console.log(`[CLIENT] ${clip(body.event, 40)} nav=${clip(body.navType, 20)} alive=${clip(body.previousLifetimeSec, 12)}s path=${clip(body.path, 120)} lastError=${clip(body.lastError)} heapMB=${clip(body.heapMB, 8)} ua=${clip(request.headers.get('user-agent'), 120)}`)
  return NextResponse.json({ ok: true })
}
