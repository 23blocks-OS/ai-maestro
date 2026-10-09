import { NextRequest } from 'next/server'
import { receiveClaudeLogs } from '@/services/telemetry-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/**
 * OTLP/HTTP logs receiver — agents launched with AIMAESTRO_TELEMETRY export
 * `claude_code.*` event logs here (the SDK appends /v1/logs to the endpoint).
 * We count `claude_code.api_request` events per session.id and increment the
 * matching agent's totalApiCalls. Always answers 200 (empty
 * ExportLogsServiceResponse) so the exporter never retry-storms.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return toResponse(receiveClaudeLogs(body))
}
