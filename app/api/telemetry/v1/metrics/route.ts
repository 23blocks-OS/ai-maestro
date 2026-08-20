import { NextRequest, NextResponse } from 'next/server'
import { ingestClaudeMetrics } from '@/services/telemetry-service'

export const dynamic = 'force-dynamic'

/**
 * OTLP/HTTP metrics receiver — agents launched with AIMAESTRO_TELEMETRY export
 * `claude_code.*` metrics here (OTEL_EXPORTER_OTLP_ENDPOINT=.../api/telemetry,
 * the SDK appends /v1/metrics). We attribute token/cost usage to agents via the
 * session.id on each data point. Always answers 200 with an empty
 * ExportMetricsServiceResponse so the exporter never retry-storms.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const summary = ingestClaudeMetrics(body)
    if (process.env.DEBUG) console.log('[Telemetry] ingest', summary)
  } catch (error) {
    console.error('[Telemetry] ingest error:', error)
  }
  return NextResponse.json({}, { status: 200 })
}
