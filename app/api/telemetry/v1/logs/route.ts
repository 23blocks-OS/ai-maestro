import { NextRequest, NextResponse } from 'next/server'
import { ingestClaudeLogs } from '@/services/telemetry-service'

export const dynamic = 'force-dynamic'

/**
 * OTLP/HTTP logs receiver — agents launched with AIMAESTRO_TELEMETRY export
 * `claude_code.*` event logs here (the SDK appends /v1/logs to the endpoint).
 * We count `claude_code.api_request` events per session.id and increment the
 * matching agent's totalApiCalls. Always answers 200 (empty
 * ExportLogsServiceResponse) so the exporter never retry-storms.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const summary = ingestClaudeLogs(body)
    if (process.env.DEBUG) console.log('[Telemetry/logs] ingest', summary)
  } catch (error) {
    console.error('[Telemetry/logs] ingest error:', error)
  }
  return NextResponse.json({}, { status: 200 })
}
