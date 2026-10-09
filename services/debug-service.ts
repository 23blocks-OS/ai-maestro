/**
 * Dashboard diagnostics (POST /api/debug/client-event).
 *
 * The dashboard reports each page load (and why the previous page ended, if it
 * knows) so an unexplained "the app reset" can be diagnosed from the server log.
 * Moved out of the Next route so the headless router serves the same function (B012).
 */

import type { ServiceResult } from '@/services/service-errors'

export function logClientEvent(rawBody: unknown, userAgent: string | null): ServiceResult<{ ok: boolean }> {
  const body: any = rawBody && typeof rawBody === 'object' ? rawBody : {}
  const clip = (v: unknown, n = 300) => String(v ?? '').slice(0, n)
  console.log(`[CLIENT] ${clip(body.event, 40)} nav=${clip(body.navType, 20)} alive=${clip(body.previousLifetimeSec, 12)}s path=${clip(body.path, 120)} lastError=${clip(body.lastError)} heapMB=${clip(body.heapMB, 8)} ua=${clip(userAgent, 120)}`)
  return { data: { ok: true }, status: 200 }
}
